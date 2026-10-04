FROM python:3.12-slim
WORKDIR /runtime
RUN pip install --no-cache-dir fastapi==0.115.0 uvicorn==0.30.6 pyyaml==6.0.3 httpx==0.28.1 pydantic==2.9.2 jsonschema==4.26.0
COPY backend /runtime/backend
COPY scripts/connector-twin.py /runtime/scripts/connector-twin.py
ENV FETCHSANDBOX_BACKEND_PATH=/runtime/backend
ENV LOOPLABS_TWIN_CONTAINER=1
RUN useradd --uid 1000 --create-home fixture
USER fixture
CMD ["python", "scripts/connector-twin.py"]
