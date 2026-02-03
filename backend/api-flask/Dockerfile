# Utilise une image Python légère et récente
FROM python:3.12-slim-bookworm

# Désactive le buffer et le bytecode pour réduire la taille
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Installe les dépendances système nécessaires
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Crée le répertoire /app avant de créer l'utilisateur
RUN mkdir /app

# Crée un utilisateur non-root pour la sécurité
RUN useradd --create-home --shell /bin/bash app

# Définit le répertoire de travail
WORKDIR /app

# Change les permissions du répertoire /app
RUN chown app:app /app

# Copie le fichier .env
COPY .env /app/.env

# Copie les fichiers nécessaires pour l'installation des dépendances
COPY api-flask/requirements.txt .
USER root
RUN pip install --no-cache-dir -r requirements.txt

# Copie le reste de l'application en tant qu'utilisateur non-root
USER app
COPY api-flask/ ./api-flask/

# Expose le port utilisé par Gunicorn
EXPOSE 8080

# Commande pour lancer l'application avec Gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "1", "--threads", "8", "--timeout", "600", "api-flask.app:app"]
