# init_db.py
"""Utility script to initialise the SQLite database for MedNotify.

Run this once (or any time you want to reset the schema) before starting the FastAPI server:

```powershell
cd backend
python -m venv .venv  # if not already created
.venv\Scripts\activate
pip install -r requirements.txt
python init_db.py
```

The script will:
- Import the SQLAlchemy `Base` from `database.py`.
- Import all model definitions from `models.py`.
- Call `Base.metadata.create_all(bind=engine)` to create the tables.
- Print a friendly message.

If you need to wipe the existing data, simply delete `mednotify.db` before running this.
"""

from database import engine, Base
import models  # ensures all model classes are registered with Base

def init_db() -> None:
    """Create all tables defined in the SQLAlchemy models."""
    Base.metadata.create_all(bind=engine)
    print("[MedNotify] SQLite database initialized at", engine.url)

if __name__ == "__main__":
    init_db()

