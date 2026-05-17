#!/bin/bash
# Seed user via Neon HTTP SQL API using curl

NEON_HOST="ep-jolly-sound-anl11hdk-pooler.c-6.us-east-1.aws.neon.tech"
CONN_STR="postgresql://neondb_owner:npg_nbcLWm3GEwJ2@${NEON_HOST}/neondb?sslmode=require"
LOG="$PWD/_curl_seed_log.txt"

echo "$(date -u) Starting..." > "$LOG"

run_sql() {
  local label="$1"
  local sql="$2"
  local params="$3"
  
  echo "$(date -u) Running: $label" >> "$LOG"
  
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
  
  echo "$(date -u) Result: $result" >> "$LOG"
  echo "$result"
}

# Step 1: Test
echo "Step 1: Testing connection..."
run_sql "SELECT 1" "SELECT 1 as ok"

# Step 2: Create User table
echo "Step 2: Creating User table..."
run_sql "CREATE TABLE" "CREATE TABLE IF NOT EXISTS \\\"User\\\" (\\\"id\\\" TEXT NOT NULL, \\\"name\\\" TEXT, \\\"email\\\" TEXT NOT NULL, \\\"role\\\" TEXT NOT NULL DEFAULT 'QS', \\\"office\\\" TEXT, \\\"createdAt\\\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, \\\"passwordHash\\\" TEXT, \\\"emailVerified\\\" TIMESTAMP(3), \\\"image\\\" TEXT, \\\"updatedAt\\\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT \\\"User_pkey\\\" PRIMARY KEY (\\\"id\\\"))"

# Step 3: Create unique index
echo "Step 3: Creating unique index..."
run_sql "CREATE INDEX" "CREATE UNIQUE INDEX IF NOT EXISTS \\\"User_email_key\\\" ON \\\"User\\\"(\\\"email\\\")"

# Step 4: Generate bcrypt hash using node inline
echo "Step 4: Generating password hash..."
HASH=$(node -e "require('bcryptjs').hash('Nyash@0123##', 10).then(h => process.stdout.write(h))")
echo "$(date -u) Hash: $HASH" >> "$LOG"

# Step 5: Insert user
echo "Step 5: Inserting user..."
ID=$(node -e "process.stdout.write(require('crypto').randomUUID())")
run_sql "INSERT USER" "INSERT INTO \\\"User\\\" (id, email, role, name, \\\"passwordHash\\\", \\\"createdAt\\\", \\\"updatedAt\\\") VALUES (\$1, \$2, \$3, \$4, \$5, NOW(), NOW()) ON CONFLICT (email) DO UPDATE SET \\\"passwordHash\\\" = EXCLUDED.\\\"passwordHash\\\", role = EXCLUDED.role" "[\"$ID\",\"bmarambire@gmail.com\",\"ADMIN\",\"Brian Marambire\",\"$HASH\"]"

echo ""
echo "=== DONE ==="
echo "$(date -u) DONE" >> "$LOG"

echo ""
echo "=== Full Log ==="
cat "$LOG"
