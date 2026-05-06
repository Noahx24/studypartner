from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    # LLM
    llm_backend: str = Field(default="ollama", alias="STUDYPARTNER_LLM_BACKEND")
    ollama_model: str = Field(default="llama3.2", alias="OLLAMA_MODEL")
    ollama_base_url: str = Field(default="http://localhost:11434", alias="OLLAMA_BASE_URL")
    ollama_timeout: int = Field(default=60, alias="OLLAMA_TIMEOUT")

    # Moodle
    moodle_base_url: str = Field(..., alias="STUDYPARTNER_MOODLE_BASE_URL")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()