# Teammate Run Package

This folder contains the full source code needed to run the portal independently.

## Requirements
- Node.js 18+ and npm

## Setup
1. Open terminal in this folder.
2. Install dependencies:
   npm install

## Run (both servers)
- PowerShell: ./scripts/start-all.ps1
- Command Prompt: scripts\start-all.cmd

## Run separately
- API only: ./scripts/start-api.ps1
- Web only: ./scripts/start-web.ps1

## URLs
- Web app: http://localhost:5173
- API health: http://localhost:4000/health
