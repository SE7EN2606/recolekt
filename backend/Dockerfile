# Utilise une image légère de Python
FROM python:3.12-slim-bookworm

# Installe les dépendances système
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    ffmpeg \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Installe Rust (nécessaire pour certains packages Python)
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Crée un utilisateur non-root
RUN useradd --create-home --shell /bin/bash app

# Définis le répertoire de travail
WORKDIR /app

# Copie le fichier .env
COPY .env /app/.env

# Copie les fichiers nécessaires
COPY api-flask/requirements.txt /app/api-flask/requirements.txt

# Installe les dépendances Python
RUN pip install --no-cache-dir -r /app/api-flask/requirements.txt

# Copie le reste de l'application
COPY api-flask/ /app/api-flask/

# Change les permissions pour l'utilisateur non-root
RUN chown -R app:app /app

# Passe à l'utilisateur non-root
USER app

# Expose le port
EXPOSE 8080

# Commande pour démarrer l'application avec des workers adaptés à Railway
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "2", "--threads", "4", "--timeout", "120", "--chdir", "/app/api-flask", "app:app"]
