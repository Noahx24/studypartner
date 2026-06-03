from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # SettingsConfigDict is the pydantic-settings v2+ replacement for the
    # legacy `class Config:` style; without this the test suite emits
    # PydanticDeprecatedSince20 on every collection.
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # LLM
    llm_backend: str = Field(default="ollama", alias="STUDYPARTNER_LLM_BACKEND")
    ollama_model: str = Field(default="llama3.2", alias="OLLAMA_MODEL")
    ollama_base_url: str = Field(default="http://localhost:11434", alias="OLLAMA_BASE_URL")
    ollama_timeout: int = Field(default=60, alias="OLLAMA_TIMEOUT")

    # Moodle
    moodle_base_url: str = Field(..., alias="STUDYPARTNER_MOODLE_BASE_URL")


settings = Settings()
