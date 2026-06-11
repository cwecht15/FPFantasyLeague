"""Push DataFrames to the cloud app Postgres via idempotent staging upserts.

Pattern per table: COPY into a TEMP staging table, then
INSERT ... ON CONFLICT DO UPDATE. When a slice key is given, also DELETE rows in
that slice that are absent from staging (so a stat correction that removes a
player's only production self-heals). One transaction per run (see pipeline).
"""

from __future__ import annotations

from io import StringIO

import pandas as pd


def _prep_df(df: pd.DataFrame) -> pd.DataFrame:
    """Make a DataFrame safe for COPY: whole-number float columns -> nullable
    Int64 (so NaN-induced floats don't emit '3.0' into integer columns)."""
    df = df.copy()
    for c in df.columns:
        if pd.api.types.is_float_dtype(df[c]):
            non_null = df[c].dropna()
            if non_null.empty or (non_null % 1 == 0).all():
                df[c] = df[c].astype("Int64")
    return df


def _copy_into(cur, tmp: str, df: pd.DataFrame, cols: list[str]) -> None:
    buf = StringIO()
    df.to_csv(buf, index=False, columns=cols)
    buf.seek(0)
    collist = ", ".join(f'"{c}"' for c in cols)
    cur.copy_expert(
        f'COPY "{tmp}" ({collist}) FROM STDIN WITH (FORMAT csv, HEADER true)', buf
    )


def upsert(
    conn,
    table: str,
    df: pd.DataFrame,
    key_cols: list[str],
    slice_cols: list[str] | None = None,
    slice_params: dict | None = None,
    hash_guard: bool = False,
) -> dict[str, int]:
    """Upsert `df` into `table`. Returns {'inserted_or_updated', 'deleted'}."""
    df = _prep_df(df)
    cols = list(df.columns)
    tmp = f"stg_{table}"

    with conn.cursor() as cur:
        cur.execute(f'DROP TABLE IF EXISTS "{tmp}"')
        cur.execute(f'CREATE TEMP TABLE "{tmp}" (LIKE "{table}" INCLUDING DEFAULTS) ON COMMIT DROP')

        if not df.empty:
            _copy_into(cur, tmp, df, cols)

        collist = ", ".join(f'"{c}"' for c in cols)
        conflict = ", ".join(f'"{c}"' for c in key_cols)
        upd_cols = [c for c in cols if c not in key_cols]

        affected = 0
        if not df.empty:
            if upd_cols:
                set_clause = ", ".join(f'"{c}" = EXCLUDED."{c}"' for c in upd_cols)
                where = ""
                if hash_guard and "source_hash" in cols:
                    where = f' WHERE "{table}".source_hash IS DISTINCT FROM EXCLUDED.source_hash'
                cur.execute(
                    f'INSERT INTO "{table}" ({collist}) SELECT {collist} FROM "{tmp}" '
                    f'ON CONFLICT ({conflict}) DO UPDATE SET {set_clause}{where}'
                )
            else:
                cur.execute(
                    f'INSERT INTO "{table}" ({collist}) SELECT {collist} FROM "{tmp}" '
                    f'ON CONFLICT ({conflict}) DO NOTHING'
                )
            affected = cur.rowcount

        deleted = 0
        if slice_cols:
            slice_where = " AND ".join(f'"{table}".{c} = %({c})s' for c in slice_cols)
            key_join = " AND ".join(f's."{k}" = "{table}"."{k}"' for k in key_cols)
            cur.execute(
                f'DELETE FROM "{table}" WHERE {slice_where} '
                f'AND NOT EXISTS (SELECT 1 FROM "{tmp}" s WHERE {key_join})',
                slice_params or {},
            )
            deleted = cur.rowcount

    return {"affected": affected, "deleted": deleted}
