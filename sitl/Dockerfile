# ArduPilot Plane SITL - Docker image
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV USER=ardupilot

# Temel bağımlılıklar
RUN apt-get update && apt-get install -y \
    git sudo lsb-release tzdata \
    python3 python3-pip python3-dev \
    build-essential ccache g++ gawk \
    libtool libxml2-dev libxslt1-dev \
    wget curl rsync \
    && rm -rf /var/lib/apt/lists/*

# ardupilot kullanıcısı (root olmadan build önerilir)
RUN useradd -m -s /bin/bash ${USER} && \
    echo "${USER} ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

USER ${USER}
WORKDIR /home/${USER}

# Git SSL verify disabled for build environment (certificate issues)
RUN git config --global http.sslVerify false && \
    git clone --recurse-submodules https://github.com/ArduPilot/ardupilot.git && \
    git config --global http.sslVerify true

WORKDIR /home/${USER}/ardupilot

# Bağımlılıkları kur (prereqs script'i)
RUN Tools/environment_install/install-prereqs-ubuntu.sh -y

# Explicit Python dependencies for SITL (as root, then available to user)
USER root
RUN pip3 install pexpect pymavlink MAVProxy pyserial empy lxml
USER ${USER}

# PATH ayarları
ENV PATH="/home/${USER}/.local/bin:/home/${USER}/ardupilot/Tools/autotest:${PATH}"
ENV PATH="/usr/lib/ccache:${PATH}"

# SITL için varsayılan portlar
# 5760: MAVLink TCP (yer istasyonu bağlantısı)
EXPOSE 5760 5762 5763

# Plane SITL'i başlat - dışarıdan bağlanabilmek için 0.0.0.0
CMD ["bash", "-c", "sim_vehicle.py -v ArduPlane --no-rebuild --out=tcpin:0.0.0.0:5760 -w"]
