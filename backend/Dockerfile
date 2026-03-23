# syntax=docker/dockerfile:1
FROM python:3.11-slim

WORKDIR /app

# Install system deps needed to compile shap / cryptography / numpy extensions
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    build-essential \
    libffi-dev \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first so Docker caches the pip layer.
# Re-runs only when requirements.txt changes.
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip && \
    pip install -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
