FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 WHISPER_MODEL=small WHISPER_MODEL_DIR=/models
COPY requirements.txt .
RUN pip install -r requirements.txt
# Download during the build, so deployments do not need to fetch weights on first use.
RUN python -c "from faster_whisper import download_model; download_model('small', cache_dir='/models')"
COPY server.py .
EXPOSE 8080
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8080} --no-access-log"]
