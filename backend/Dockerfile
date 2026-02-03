# Utilise une image légère de Python
FROM python:3.12-slim

# Définis le répertoire de travail
WORKDIR /app

# Installe les dépendances système, y compris Rust
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y \
    && source $HOME/.cargo/env \
    && rustup default stable \
    && rm -rf /var/lib/apt/lists/*

# Ajoute Rust au PATH
ENV PATH="/root/.cargo/bin:${PATH}"

# Copie les fichiers de configuration et les dépendances
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copie le reste de l'application
COPY . .

# Expose le port sur lequel ton application écoute
EXPOSE 8080

# Commande pour démarrer l'application
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "app:app"]
