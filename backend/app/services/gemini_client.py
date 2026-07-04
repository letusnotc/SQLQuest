from functools import lru_cache

from google import genai
from google.genai import types
from pydantic import BaseModel

from app.core.config import get_settings

DEFAULT_MODEL = "gemini-2.5-flash"


@lru_cache
def get_client() -> genai.Client:
    settings = get_settings()
    return genai.Client(api_key=settings.google_api_key)


def generate_structured(
    prompt: str,
    response_schema: type[BaseModel],
    system_instruction: str | None = None,
    model: str = DEFAULT_MODEL,
) -> BaseModel:
    """Calls Gemini with a strict JSON response schema and returns the parsed
    Pydantic object. Raises if the model output can't be validated against the schema.
    """
    client = get_client()
    response = client.models.generate_content(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=system_instruction,
            response_mime_type="application/json",
            response_schema=response_schema,
        ),
    )

    parsed = response.parsed
    if parsed is None:
        raise ValueError(f"Gemini did not return parseable structured output. Raw text: {response.text!r}")
    return parsed


def generate_text(
    prompt: str,
    system_instruction: str | None = None,
    model: str = DEFAULT_MODEL,
) -> str:
    client = get_client()
    response = client.models.generate_content(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(system_instruction=system_instruction),
    )
    return response.text or ""


def stream_text(
    prompt: str,
    system_instruction: str | None = None,
    model: str = DEFAULT_MODEL,
):
    """Yields the model's reply token-by-token for a streamed tutor response."""
    client = get_client()
    stream = client.models.generate_content_stream(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(system_instruction=system_instruction),
    )
    for chunk in stream:
        if chunk.text:
            yield chunk.text
