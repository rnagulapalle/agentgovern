# Build context: private runtime directory containing the existing FetchSandbox
# backend app/configs/specs and scripts/refund-twin.py. No credentials in image.
FROM python:3.12-slim
WORKDIR /runtime
RUN pip install --no-cache-dir fastapi==0.115.0 uvicorn==0.30.6 pyyaml==6.0.3 httpx==0.28.1 pydantic==2.9.2
COPY backend /runtime/backend
COPY scripts/refund-twin.py /runtime/scripts/refund-twin.py
ENV FETCHSANDBOX_BACKEND_PATH=/runtime/backend
ENV LOOPLABS_TWIN_CONTAINER=1
RUN useradd --uid 1000 --create-home fixture
USER fixture
CMD ["python", "scripts/refund-twin.py"]
