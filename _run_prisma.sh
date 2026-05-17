#!/bin/bash
cd /c/Users/ze9167867/Desktop/erp_bamlo-frica
echo "=== Starting prisma db push ==="
echo "POSTGRES_PRISMA_URL starts with: ${POSTGRES_PRISMA_URL:0:60}"
npx prisma db push --accept-data-loss 2>&1
echo "=== DB PUSH EXIT: $? ==="
echo "=== Starting seed ==="
npx tsx prisma/seed.ts 2>&1
echo "=== SEED EXIT: $? ==="
