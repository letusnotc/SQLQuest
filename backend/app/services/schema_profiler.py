"""Builds a schema_profile dict from a set of {table_name: DataFrame} and detects
likely foreign-key relationships across tables by column-name and value-overlap heuristics.
"""

from __future__ import annotations

import pandas as pd

SAMPLE_ROWS = 5
MAX_CARDINALITY_SAMPLE = 5000


def profile_table(name: str, df: pd.DataFrame) -> dict:
    columns = []
    for col in df.columns:
        series = df[col]
        columns.append(
            {
                "name": col,
                "dtype": str(series.dtype),
                "null_count": int(series.isna().sum()),
                "cardinality": int(series.nunique(dropna=True)),
            }
        )

    sample = df.head(SAMPLE_ROWS).where(pd.notnull(df.head(SAMPLE_ROWS)), None).to_dict(orient="records")

    return {
        "name": name,
        "row_count": int(len(df)),
        "columns": columns,
        "sample_rows": sample,
    }


def _column_value_set(df: pd.DataFrame, col: str) -> set:
    series = df[col].dropna()
    if len(series) > MAX_CARDINALITY_SAMPLE:
        series = series.sample(MAX_CARDINALITY_SAMPLE, random_state=0)
    return set(series.tolist())


def detect_relationships(tables: dict[str, pd.DataFrame]) -> list[dict]:
    """Heuristic FK detection: same/similar column name across two tables with
    significant value overlap (>= 70% of the smaller column's distinct values).
    """
    relationships = []
    table_names = list(tables.keys())

    for i, left_name in enumerate(table_names):
        left_df = tables[left_name]
        for right_name in table_names[i + 1 :]:
            right_df = tables[right_name]

            shared_cols = set(left_df.columns) & set(right_df.columns)
            id_like_cols = {c for c in shared_cols if "id" in c.lower() or "key" in c.lower()}
            candidate_cols = id_like_cols or shared_cols

            for col in candidate_cols:
                left_values = _column_value_set(left_df, col)
                right_values = _column_value_set(right_df, col)
                if not left_values or not right_values:
                    continue

                smaller = min(len(left_values), len(right_values))
                overlap = len(left_values & right_values)
                if smaller == 0:
                    continue

                overlap_ratio = overlap / smaller
                if overlap_ratio >= 0.7:
                    relationships.append(
                        {
                            "left_table": left_name,
                            "right_table": right_name,
                            "column": col,
                            "overlap_ratio": round(overlap_ratio, 3),
                        }
                    )

    return relationships


def build_schema_profile(tables: dict[str, pd.DataFrame]) -> dict:
    return {
        "tables": [profile_table(name, df) for name, df in tables.items()],
        "relationships": detect_relationships(tables),
    }
