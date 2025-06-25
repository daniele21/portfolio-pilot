# Dockerfile

# Use an official Python runtime as a parent image
FROM python:3.9-slim

# Set environment variables
# 1. Tells Python to not buffer stdout/stderr, making logs appear immediately.
# 2. Prevents Python from writing .pyc files.
ENV PYTHONUNBUFFERED True
ENV PYTHONDONTWRITEBYTECODE True

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file and install dependencies
# This is done in a separate step to leverage Docker's layer caching.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application source code into the container
COPY . .

# Cloud Run provides the PORT environment variable.
# We tell Gunicorn to bind to all IPs on that port.
# The `app:app` refers to the `app` variable (our Flask instance) inside the `app.py` module.
# The CMD line is what runs when the container starts.
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "app:app"]