# CUDA-enabled image to run EDICTOR locally in a container
FROM pytorch/pytorch:2.3.0-cuda12.1-cudnn8-runtime

WORKDIR /app

# System deps (optional: add build tools if needed for lingpy/lingrex)
RUN apt-get update \
  && apt-get install -y --no-install-recommends gcc g++ \
  && rm -rf /var/lib/apt/lists/*

# Install EDICTOR from source (includes optional lingpy extras)
COPY . /app
RUN pip install --no-cache-dir ".[lingpy]"

# Default port
ENV PORT=9999
EXPOSE 9999

# Run server; can override PORT at runtime
CMD ["sh", "-c", "edictor server --port ${PORT}"]
