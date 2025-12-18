#!/bin/bash
set -e

# Get the absolute path of the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Get project root (parent of scripts dir)
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "======================================"
echo "Casper Contract Build & Deploy"
echo "======================================"
echo "Project Root: $PROJECT_ROOT"

# Configuration
NODE_URL="https://node.testnet.casper.network"
CHAIN_NAME="casper-test"
SECRET_KEY="$PROJECT_ROOT/keys/secret_key.pem"
PAYMENT_AMOUNT_WAS_DEFAULT=false
if [ -z "${PAYMENT_AMOUNT+x}" ]; then
    PAYMENT_AMOUNT="1000000000"  # default: 1 CSPR
    PAYMENT_AMOUNT_WAS_DEFAULT=true
fi
GAS_PRICE_TOLERANCE="5"
ODRA_DEPLOY="${ODRA_DEPLOY:-false}"
PACKAGE_HASH_KEY_NAME="${PACKAGE_HASH_KEY_NAME:-casper_swap_package_hash}"
ALLOW_KEY_OVERRIDE="${ALLOW_KEY_OVERRIDE:-true}"
IS_UPGRADABLE="${IS_UPGRADABLE:-true}"
IS_UPGRADE="${IS_UPGRADE:-false}"
PRICING_MODE="${PRICING_MODE:-classic}"
TRANSACTION_RUNTIME="${TRANSACTION_RUNTIME:-vm-casper-v1}"
TRANSFERRED_VALUE="${TRANSFERRED_VALUE:-0}"

# Step 1: Build contract
echo ""
echo "Step 1: Building contract..."
cd "$PROJECT_ROOT/contracts"

# Check if cargo is available
if command -v cargo &> /dev/null; then
    if [ "$ODRA_DEPLOY" = true ]; then
        echo "ODRA_DEPLOY=true - skipping cargo build (use 'cargo odra build' to generate wasm in ./wasm/)"
    else
        cargo build --release --target wasm32-unknown-unknown
    fi
else
    echo "⚠️ Cargo not found. Skipping build and using existing WASM..."
fi

if [ "$ODRA_DEPLOY" = true ]; then
    WASM_PATH="${WASM_PATH:-$PROJECT_ROOT/wasm/casper_swap.wasm}"
else
    WASM_PATH="${WASM_PATH:-target/wasm32-unknown-unknown/release/casper_swap_deploy.wasm}"
fi

if [ ! -f "$WASM_PATH" ]; then
    echo "❌ Connect find WASM file at: $WASM_PATH"
    echo "Please ensure the contract is built."
    exit 1
fi

ORIGINAL_SIZE=$(stat -c%s "$WASM_PATH")
echo "✓ WASM found: $ORIGINAL_SIZE bytes"

if [ "$PAYMENT_AMOUNT_WAS_DEFAULT" = true ] && [ "$ORIGINAL_SIZE" -gt 200000 ]; then
    PAYMENT_AMOUNT="50000000000"
fi

# Step 2: Optimize (Optional)
if command -v wasm-strip &> /dev/null; then
    echo ""
    echo "Step 2: Stripping with wasm-strip..."
    wasm-strip "$WASM_PATH"
    echo "✓ Stripped"
fi

if command -v wasm-opt &> /dev/null; then
    echo ""
    echo "Step 2: Optimizing with wasm-opt..."
    wasm-opt -Oz "$WASM_PATH" -o "${WASM_PATH}.opt"
    mv "${WASM_PATH}.opt" "$WASM_PATH"
    echo "✓ Optimized"
else
    echo "Step 2: Skipping optimization (wasm-opt not found)"
fi

# Step 3: Deploy
echo ""
echo "Step 3: Deploying to Casper Testnet..."
echo "Node: $NODE_URL"
echo "Secret Key: $SECRET_KEY"

# Execute casper-client from the contracts directory (where WASM is relative to)
if [ "$ODRA_DEPLOY" = true ]; then
    casper-client put-transaction session \
        --node-address "$NODE_URL" \
        --chain-name "$CHAIN_NAME" \
        --secret-key "$SECRET_KEY" \
        --wasm-path "$WASM_PATH" \
        --pricing-mode "$PRICING_MODE" \
        --payment-amount "$PAYMENT_AMOUNT" \
        --gas-price-tolerance "$GAS_PRICE_TOLERANCE" \
        --standard-payment true \
        --transferred-value "$TRANSFERRED_VALUE" \
        --transaction-runtime "$TRANSACTION_RUNTIME" \
        --install-upgrade \
        --session-arg "odra_cfg_package_hash_key_name:string:'$PACKAGE_HASH_KEY_NAME'" \
        --session-arg "odra_cfg_allow_key_override:bool:'$ALLOW_KEY_OVERRIDE'" \
        --session-arg "odra_cfg_is_upgradable:bool:'$IS_UPGRADABLE'" \
        --session-arg "odra_cfg_is_upgrade:bool:'$IS_UPGRADE'"
else
    casper-client put-transaction session \
        --node-address "$NODE_URL" \
        --chain-name "$CHAIN_NAME" \
        --secret-key "$SECRET_KEY" \
        --wasm-path "$WASM_PATH" \
        --payment-amount "$PAYMENT_AMOUNT" \
        --gas-price-tolerance "$GAS_PRICE_TOLERANCE" \
        --standard-payment true
fi

echo ""
echo "======================================"
echo "✅ Deployment Computed!"
echo "If successful, the Deploy Hash is printed above."
echo "Check status at: https://testnet.cspr.live/"
echo "======================================"
