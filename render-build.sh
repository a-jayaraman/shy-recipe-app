#!/usr/bin/env bash
set -e

pip install -r backend/requirements.txt

cd frontend
npm install
npm run build
