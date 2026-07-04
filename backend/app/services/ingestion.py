"""Parses uploaded CSV/Excel files into pandas DataFrames and loads them into a
fresh, per-dataset DuckDB database.
"""

from __future__ import annotations

import re

import pandas as pd
import duckdb


def _sanitize_identifier(name: str) -> str:
    name = re.sub(r"[^0-9a-zA-Z_]", "_", name.strip())
    if not name or name[0].isdigit():
        name = f"t_{name}"
    return name.lower()


def _dedupe_name(name: str, existing: set[str]) -> str:
    candidate = name
    suffix = 2
    while candidate in existing:
        candidate = f"{name}_{suffix}"
        suffix += 1
    return candidate


# Tried in order. utf-8-sig transparently strips a BOM if present (and is a
# strict superset of utf-8 otherwise). cp1252 is what Excel on Windows writes
# for "CSV (Comma delimited)" exports whenever the data has any non-ASCII
# character. latin-1 never raises (every byte maps to a codepoint), so it's
# the last-resort fallback rather than a first choice.
CSV_ENCODING_FALLBACKS = ("utf-8-sig", "cp1252", "latin-1")


def _read_csv_with_encoding_fallback(content: bytes) -> pd.DataFrame:
    last_error: UnicodeDecodeError | None = None
    for encoding in CSV_ENCODING_FALLBACKS:
        try:
            return pd.read_csv(pd.io.common.BytesIO(content), encoding=encoding)
        except UnicodeDecodeError as e:
            last_error = e
    raise ValueError(f"Could not decode CSV with any supported encoding: {last_error}")


def parse_uploaded_files(files: list[tuple[str, bytes]]) -> dict[str, pd.DataFrame]:
    """files: list of (filename, raw_bytes). Excel files may yield multiple tables (one per sheet)."""
    tables: dict[str, pd.DataFrame] = {}

    for filename, content in files:
        base_name = _sanitize_identifier(filename.rsplit(".", 1)[0])
        lower = filename.lower()

        if lower.endswith(".csv"):
            df = _read_csv_with_encoding_fallback(content)
            table_name = _dedupe_name(base_name, set(tables.keys()))
            tables[table_name] = df

        elif lower.endswith((".xlsx", ".xls")):
            sheets = pd.read_excel(pd.io.common.BytesIO(content), sheet_name=None)
            for sheet_name, df in sheets.items():
                name = base_name if len(sheets) == 1 else f"{base_name}_{_sanitize_identifier(sheet_name)}"
                table_name = _dedupe_name(name, set(tables.keys()))
                tables[table_name] = df
        else:
            raise ValueError(f"Unsupported file type: {filename}")

    return tables


def load_tables_into_duckdb(con: duckdb.DuckDBPyConnection, tables: dict[str, pd.DataFrame]) -> None:
    for table_name, df in tables.items():
        con.register("_tmp_df", df)
        con.execute(f"CREATE OR REPLACE TABLE {table_name} AS SELECT * FROM _tmp_df")
        con.unregister("_tmp_df")
