$ErrorActionPreference = "Stop"
alembic -c database/alembic.ini upgrade head
