#!/bin/bash
set -euo pipefail

# =============================================================================
# CompoundCalc - Full Stack Deployment Script
# Deploys: React Frontend, Spring Boot Backend, Lambda Calculator, AWS Infra
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="${APP_NAME:-compound-calc}"
AWS_REGION="${AWS_REGION:-us-east-1}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# -----------------------------------------------------------------------------
# Pre-flight checks
# -----------------------------------------------------------------------------
check_prerequisites() {
    log_info "Checking prerequisites..."

    local missing=()

    command -v node   >/dev/null 2>&1 || missing+=("node")
    command -v npm    >/dev/null 2>&1 || missing+=("npm")
    command -v java   >/dev/null 2>&1 || missing+=("java (JDK 17+)")
    command -v mvn    >/dev/null 2>&1 || missing+=("maven")
    command -v docker >/dev/null 2>&1 || missing+=("docker")
    command -v aws    >/dev/null 2>&1 || missing+=("aws-cli")

    if [ ${#missing[@]} -ne 0 ]; then
        log_error "Missing required tools: ${missing[*]}"
        exit 1
    fi

    # Verify AWS credentials
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        log_error "AWS credentials not configured. Run 'aws configure' first."
        exit 1
    fi

    log_ok "All prerequisites met"
}

# -----------------------------------------------------------------------------
# Build Lambda JAR
# -----------------------------------------------------------------------------
build_lambda() {
    log_info "Building Lambda calculator JAR..."
    cd "${SCRIPT_DIR}/lambda-calculator"
    mvn clean package -DskipTests -q
    log_ok "Lambda JAR built: target/compound-interest-lambda-1.0.0.jar"
}

# -----------------------------------------------------------------------------
# Build Spring Boot backend Docker image (for local testing)
# -----------------------------------------------------------------------------
build_backend() {
    log_info "Building Spring Boot backend..."
    cd "${SCRIPT_DIR}/backend"
    mvn clean package -DskipTests -q
    log_ok "Backend JAR built"
}

# -----------------------------------------------------------------------------
# Build React frontend
# -----------------------------------------------------------------------------
build_frontend() {
    log_info "Building React frontend..."
    cd "${SCRIPT_DIR}/frontend"
    npm ci --silent
    VITE_API_BASE_URL="/api" npm run build
    log_ok "Frontend built: dist/"
}

# -----------------------------------------------------------------------------
# Install CDK dependencies
# -----------------------------------------------------------------------------
install_infra_deps() {
    log_info "Installing CDK dependencies..."
    cd "${SCRIPT_DIR}/infra"
    npm ci --silent
    log_ok "CDK dependencies installed"
}

# -----------------------------------------------------------------------------
# Bootstrap CDK (first time only)
# -----------------------------------------------------------------------------
bootstrap_cdk() {
    log_info "Bootstrapping CDK (if needed)..."
    cd "${SCRIPT_DIR}/infra"
    local account_id
    account_id=$(aws sts get-caller-identity --query Account --output text)
    npx cdk bootstrap "aws://${account_id}/${AWS_REGION}" 2>/dev/null || true
    log_ok "CDK bootstrapped"
}

# -----------------------------------------------------------------------------
# Deploy all stacks
# -----------------------------------------------------------------------------
deploy_stacks() {
    log_info "Deploying all AWS stacks via CDK..."
    cd "${SCRIPT_DIR}/infra"
    npx cdk deploy --all \
        --require-approval never \
        --context appName="${APP_NAME}" \
        --outputs-file "${SCRIPT_DIR}/cdk-outputs.json"
    log_ok "All stacks deployed"
}

# -----------------------------------------------------------------------------
# Print outputs
# -----------------------------------------------------------------------------
print_outputs() {
    echo ""
    echo -e "${GREEN}=============================================${NC}"
    echo -e "${GREEN} CompoundCalc Deployment Complete!${NC}"
    echo -e "${GREEN}=============================================${NC}"
    echo ""

    if [ -f "${SCRIPT_DIR}/cdk-outputs.json" ]; then
        log_info "Stack outputs:"
        cat "${SCRIPT_DIR}/cdk-outputs.json" | python3 -m json.tool 2>/dev/null || cat "${SCRIPT_DIR}/cdk-outputs.json"
    fi

    echo ""
    log_info "To destroy all resources: ./deploy.sh destroy"
}

# -----------------------------------------------------------------------------
# Destroy all stacks
# -----------------------------------------------------------------------------
destroy_stacks() {
    log_warn "Destroying all AWS stacks..."
    cd "${SCRIPT_DIR}/infra"
    npx cdk destroy --all --force --context appName="${APP_NAME}"
    log_ok "All stacks destroyed"
}

# -----------------------------------------------------------------------------
# Local development setup
# -----------------------------------------------------------------------------
local_dev() {
    log_info "Setting up local development environment..."

    # Check for Docker Compose
    if ! command -v docker-compose >/dev/null 2>&1 && ! docker compose version >/dev/null 2>&1; then
        log_error "docker-compose or 'docker compose' is required for local dev"
        exit 1
    fi

    cd "${SCRIPT_DIR}"
    docker compose -f docker-compose.local.yml up -d

    log_info "Starting backend..."
    cd "${SCRIPT_DIR}/backend"
    mvn spring-boot:run -Dspring-boot.run.profiles=local &

    log_info "Starting frontend dev server..."
    cd "${SCRIPT_DIR}/frontend"
    npm run dev &

    log_ok "Local dev environment running:"
    echo "  Frontend: http://localhost:5173"
    echo "  Backend:  http://localhost:8080"
    echo "  Kafka:    localhost:9092"
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
usage() {
    echo "Usage: $0 {deploy|destroy|build|local|help}"
    echo ""
    echo "Commands:"
    echo "  deploy   - Build all artifacts and deploy to AWS via CDK"
    echo "  destroy  - Tear down all AWS resources"
    echo "  build    - Build all artifacts without deploying"
    echo "  local    - Start local development environment"
    echo "  help     - Show this message"
    echo ""
    echo "Environment variables:"
    echo "  APP_NAME    - Application name prefix (default: compound-calc)"
    echo "  AWS_REGION  - AWS region (default: us-east-1)"
}

case "${1:-help}" in
    deploy)
        check_prerequisites
        build_lambda
        build_backend
        build_frontend
        install_infra_deps
        bootstrap_cdk
        deploy_stacks
        print_outputs
        ;;
    destroy)
        check_prerequisites
        install_infra_deps
        destroy_stacks
        ;;
    build)
        check_prerequisites
        build_lambda
        build_backend
        build_frontend
        log_ok "All artifacts built successfully"
        ;;
    local)
        local_dev
        ;;
    help|*)
        usage
        ;;
esac
