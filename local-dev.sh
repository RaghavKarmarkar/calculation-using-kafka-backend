#!/bin/bash
set -e

# CompoundCalc — Local Development Launcher
# Starts Kafka + DynamoDB (Docker), local WebSocket server, and React frontend

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}   CompoundCalc — Local Development Environment${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

case "${1:-start}" in
  start)
    echo ""
    echo -e "${YELLOW}[1/3] Starting Docker containers (Kafka + DynamoDB)...${NC}"
    docker compose -f "$PROJECT_DIR/docker-compose.local.yml" up -d
    echo -e "${GREEN}  ✓ Kafka:    localhost:9092${NC}"
    echo -e "${GREEN}  ✓ DynamoDB: localhost:8000${NC}"

    # Wait for Kafka to be ready
    echo -e "${YELLOW}  Waiting for Kafka to be ready...${NC}"
    sleep 8

    echo ""
    echo -e "${YELLOW}[2/3] Starting local WebSocket server...${NC}"
    cd "$PROJECT_DIR/local-server"
    npm install --silent 2>/dev/null
    node server.js &
    LOCAL_SERVER_PID=$!
    echo $LOCAL_SERVER_PID > "$PROJECT_DIR/.local-server.pid"
    sleep 2
    echo -e "${GREEN}  ✓ WebSocket: ws://localhost:8080${NC}"

    echo ""
    echo -e "${YELLOW}[3/3] Starting React frontend...${NC}"
    cd "$PROJECT_DIR/frontend"
    VITE_WS_URL=ws://localhost:8080 npx vite --host &
    FRONTEND_PID=$!
    echo $FRONTEND_PID > "$PROJECT_DIR/.frontend.pid"
    sleep 3

    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  Local development environment is ready!${NC}"
    echo ""
    echo -e "  Frontend:   ${GREEN}http://localhost:5173${NC}"
    echo -e "  WebSocket:  ${GREEN}ws://localhost:8080${NC}"
    echo -e "  Kafka:      ${GREEN}localhost:9092${NC}"
    echo -e "  DynamoDB:   ${GREEN}localhost:8000${NC}"
    echo ""
    echo -e "  Stop with:  ${YELLOW}./local-dev.sh stop${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    # Wait for Ctrl+C
    wait $FRONTEND_PID 2>/dev/null
    ;;

  stop)
    echo -e "${YELLOW}Stopping local development environment...${NC}"

    if [ -f "$PROJECT_DIR/.local-server.pid" ]; then
      kill "$(cat "$PROJECT_DIR/.local-server.pid")" 2>/dev/null || true
      rm "$PROJECT_DIR/.local-server.pid"
      echo -e "${GREEN}  ✓ Local server stopped${NC}"
    fi

    if [ -f "$PROJECT_DIR/.frontend.pid" ]; then
      kill "$(cat "$PROJECT_DIR/.frontend.pid")" 2>/dev/null || true
      rm "$PROJECT_DIR/.frontend.pid"
      echo -e "${GREEN}  ✓ Frontend stopped${NC}"
    fi

    docker compose -f "$PROJECT_DIR/docker-compose.local.yml" down
    echo -e "${GREEN}  ✓ Docker containers stopped${NC}"
    echo -e "${GREEN}Done.${NC}"
    ;;

  test)
    echo -e "${YELLOW}Running Lambda unit tests...${NC}"
    cd "$PROJECT_DIR/lambda-calculator"
    mvn test
    echo -e "${GREEN}  ✓ Tests passed${NC}"
    ;;

  *)
    echo "Usage: ./local-dev.sh [start|stop|test]"
    echo ""
    echo "  start  - Start Kafka, WebSocket server, and React frontend"
    echo "  stop   - Stop all local services"
    echo "  test   - Run Lambda unit tests"
    ;;
esac
