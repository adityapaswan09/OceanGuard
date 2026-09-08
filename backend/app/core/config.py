import os

from dotenv import load_dotenv

load_dotenv()


class Settings:
    app_name: str = os.getenv("APP_NAME", "Marine Oil-Spill Investigation API")
    environment: str = os.getenv("ENVIRONMENT", "development")
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg2://adityapaswan@localhost:5432/oil_spill_db",
    )


settings = Settings()
