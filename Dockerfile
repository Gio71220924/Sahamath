FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv python3-pip curl ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY requirements.txt ./
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/python -m pip install --upgrade pip \
    && /opt/venv/bin/python -m pip install -r requirements.txt

ENV PATH="/opt/venv/bin:${PATH}"
ENV NODE_ENV=production
# Jam WIB: "hari ini", "x hari lagi" dan minggu kalender dihitung untuk pengguna Indonesia, bukan UTC
ENV TZ=Asia/Jakarta

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
