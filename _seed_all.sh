#!/bin/bash
# Seed ALL users via Neon HTTP SQL API using curl

NEON_HOST="ep-jolly-sound-anl11hdk-pooler.c-6.us-east-1.aws.neon.tech"
CONN_STR="postgresql://neondb_owner:npg_nbcLWm3GEwJ2@${NEON_HOST}/neondb?sslmode=require"
LOG="$PWD/_seed_all_log.txt"

echo "$(date -u) Starting full seed..." > "$LOG"

run_sql() {
  local label="$1"
  local sql="$2"
  local params="$3"

  echo "$(date -u) [$label]" >> "$LOG"

  local body
  if [ -n "$params" ]; then
    body="{\"query\":\"$sql\",\"params\":$params}"
  else
    body="{\"query\":\"$sql\",\"params\":[]}"
  fi

  local result
  result=$(curl --max-time 30 -s -X POST "https://${NEON_HOST}/sql" \
    -H "Content-Type: application/json" \
    -H "Neon-Connection-String: ${CONN_STR}" \
    -H "Neon-Pool-Opt-In: true" \
    -d "$body" 2>&1)

  echo "$(date -u) -> $result" >> "$LOG"
  echo "$result"
}

# Hash for Password@123
HASH_DEFAULT=$(node -e "require('bcryptjs').hash('Password@123', 10).then(h => process.stdout.write(h))")
echo "$(date -u) Default hash: $HASH_DEFAULT" >> "$LOG"

# Hash for Nyash@0123##
HASH_BRIAN=$(node -e "require('bcryptjs').hash('Nyash@0123##', 10).then(h => process.stdout.write(h))")
echo "$(date -u) Brian hash: $HASH_BRIAN" >> "$LOG"

# Seed all role users (password: Password@123)
ROLES=("ADMIN" "QS" "SENIOR_QS" "SALES" "SALESACCOUNT" "PROJECT_OPERATIONS_OFFICER" "PROCUREMENT" "ACCOUNTS" "SECURITY" "DRIVER" "ACCOUNTING_CLERK" "ACCOUNTING_OFFICER" "ACCOUNTING_AUDITOR")

for ROLE in "${ROLES[@]}"; do
  EMAIL=$(echo "$ROLE" | tr '[:upper:]' '[:lower:]')@barmlo.com
  NAME=$(echo "$ROLE" | tr '_' ' ')
  ID=$(node -e "process.stdout.write(require('crypto').randomUUID())")

  echo "Seeding $EMAIL ($ROLE)..."
  run_sql "$EMAIL" \
    "INSERT INTO \\\"User\\\" (id, email, role, name, \\\"passwordHash\\\", \\\"createdAt\\\", \\\"updatedAt\\\") VALUES (\$1, \$2, \$3, \$4, \$5, NOW(), NOW()) ON CONFLICT (email) DO UPDATE SET \\\"passwordHash\\\" = EXCLUDED.\\\"passwordHash\\\", role = EXCLUDED.role" \
    "[\"$ID\",\"$EMAIL\",\"$ROLE\",\"$NAME\",\"$HASH_DEFAULT\"]"
done

# Seed bmarambire@gmail.com (ADMIN, password: Nyash@0123##)
echo "Seeding bmarambire@gmail.com (ADMIN)..."
ID=$(node -e "process.stdout.write(require('crypto').randomUUID())")
run_sql "bmarambire@gmail.com" \
  "INSERT INTO \\\"User\\\" (id, email, role, name, \\\"passwordHash\\\", \\\"createdAt\\\", \\\"updatedAt\\\") VALUES (\$1, \$2, \$3, \$4, \$5, NOW(), NOW()) ON CONFLICT (email) DO UPDATE SET \\\"passwordHash\\\" = EXCLUDED.\\\"passwordHash\\\", role = EXCLUDED.role" \
  "[\"$ID\",\"bmarambire@gmail.com\",\"ADMIN\",\"Brian Marambire\",\"$HASH_BRIAN\"]"

echo ""
echo "=== ALL DONE ==="
echo "$(date -u) ALL DONE" >> "$LOG"
