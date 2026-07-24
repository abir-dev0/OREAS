FROM python:3.11-slim

# Prevent Python from writing bytecode and buffer stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies required for PostgreSQL and build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY requirements.txt /app/
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . /app/

# Run collectstatic for WhiteNoise (dummy SECRET_KEY needed for build step only)
RUN SECRET_KEY=build-time-dummy-secret-key DB_ENGINE=sqlite python manage.py collectstatic --noinput

EXPOSE 8000

# Production startup command using Gunicorn (Railway injects $PORT at runtime)
CMD gunicorn oreas_server.wsgi:application --bind 0.0.0.0:${PORT:-8000}
