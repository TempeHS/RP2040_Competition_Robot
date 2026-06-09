FROM ubuntu:26.04

# Install build dependencies for MicroPython RP2 (Raspberry Pi Pico) and the
# web-based simulator's Jest/ESLint test toolchain.
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    python3 \
    python3-pip \
    git \
    gcc-arm-none-eabi \
    libnewlib-arm-none-eabi \
    wget \
    unzip \
    ca-certificates \
    curl \
    gnupg \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
         | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
         > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Use /workspaces to match Codespaces defaults
WORKDIR /workspaces

# Set default shell
SHELL ["/bin/bash", "-c"]

# Optionally install Python requirements (if needed for build scripts)
COPY requirements.txt /tmp/devcontainer-requirements.txt
RUN pip3 install -r /tmp/devcontainer-requirements.txt || true && rm -f /tmp/devcontainer-requirements.txt

# Display build instructions on container start
CMD ["bash"]
