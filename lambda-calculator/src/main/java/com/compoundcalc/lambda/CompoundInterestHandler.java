package com.compoundcalc.lambda;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.KafkaEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import software.amazon.awssdk.core.SdkBytes;
import software.amazon.awssdk.services.apigatewaymanagementapi.ApiGatewayManagementApiClient;
import software.amazon.awssdk.services.apigatewaymanagementapi.model.PostToConnectionRequest;
import software.amazon.awssdk.services.apigatewaymanagementapi.model.GoneException;

import java.net.URI;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

public class CompoundInterestHandler implements RequestHandler<KafkaEvent, String> {

    private static final Logger logger = LoggerFactory.getLogger(CompoundInterestHandler.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    // DynamoDB cache (optional, enabled when CACHE_TABLE_NAME is set)
    private final ResultCacheService cacheService;

    public CompoundInterestHandler() {
        String cacheTable = System.getenv("CACHE_TABLE_NAME");
        long cacheTtl = parseLong(System.getenv("CACHE_TTL_SECONDS"), 86400); // default 24h
        if (cacheTable != null && !cacheTable.isEmpty()) {
            this.cacheService = new ResultCacheService(cacheTable, cacheTtl);
            logger.info("DynamoDB cache enabled: table={}, ttl={}s", cacheTable, cacheTtl);
        } else {
            this.cacheService = null;
            logger.info("DynamoDB cache disabled (CACHE_TABLE_NAME not set)");
        }
    }

    private static long parseLong(String value, long defaultValue) {
        if (value == null || value.isEmpty()) return defaultValue;
        try { return Long.parseLong(value); } catch (NumberFormatException e) { return defaultValue; }
    }

    @Override
    public String handleRequest(KafkaEvent kafkaEvent, Context context) {
        logger.info("Received Kafka event with {} records", countRecords(kafkaEvent));

        for (Map.Entry<String, java.util.List<KafkaEvent.KafkaEventRecord>> entry :
                kafkaEvent.getRecords().entrySet()) {

            for (KafkaEvent.KafkaEventRecord record : entry.getValue()) {
                processRecord(record);
            }
        }

        return "OK";
    }

    private void processRecord(KafkaEvent.KafkaEventRecord record) {
        String calculationId = null;
        CalculationEvent event = null;
        try {
            String payload = new String(Base64.getDecoder().decode(record.getValue()));
            logger.info("Processing record: {}", payload);

            event = objectMapper.readValue(payload, CalculationEvent.class);
            calculationId = event.getCalculationId();

            // Check cache first (if enabled)
            double finalAmount;
            boolean cacheHit = false;
            if (cacheService != null) {
                Optional<Double> cached = cacheService.get(
                        event.getPrincipal(), event.getAnnualRate(),
                        event.getYears(), event.getCompoundingFrequency());
                if (cached.isPresent()) {
                    finalAmount = cached.get();
                    cacheHit = true;
                } else {
                    finalAmount = calculateCompoundInterest(
                            event.getPrincipal(), event.getAnnualRate(),
                            event.getYears(), event.getCompoundingFrequency());
                    cacheService.put(event.getPrincipal(), event.getAnnualRate(),
                            event.getYears(), event.getCompoundingFrequency(), finalAmount);
                }
            } else {
                finalAmount = calculateCompoundInterest(
                        event.getPrincipal(), event.getAnnualRate(),
                        event.getYears(), event.getCompoundingFrequency());
            }

            logger.info("Calculation [{}]: P={}, R={}, T={}, N={} => A={} (cache={})",
                    calculationId, event.getPrincipal(), event.getAnnualRate(),
                    event.getYears(), event.getCompoundingFrequency(), finalAmount,
                    cacheHit ? "HIT" : "MISS");

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("calculationId", calculationId);
            result.put("status", "COMPLETED");
            result.put("principal", event.getPrincipal());
            result.put("annualRate", event.getAnnualRate());
            result.put("years", event.getYears());
            result.put("compoundingFrequency", event.getCompoundingFrequency());
            result.put("finalAmount", finalAmount);
            result.put("completedAt", System.currentTimeMillis());

            sendToWebSocket(event.getWsCallbackUrl(), event.getConnectionId(), result);

        } catch (Exception e) {
            logger.error("Error processing record: {}", e.getMessage(), e);
            if (event != null && event.getConnectionId() != null && event.getWsCallbackUrl() != null) {
                Map<String, Object> errorResult = new LinkedHashMap<>();
                errorResult.put("calculationId", calculationId);
                errorResult.put("status", "FAILED");
                errorResult.put("errorMessage", e.getMessage());
                try {
                    sendToWebSocket(event.getWsCallbackUrl(), event.getConnectionId(), errorResult);
                } catch (Exception ex) {
                    logger.error("Failed to send error via WebSocket for [{}]: {}", calculationId, ex.getMessage());
                }
            }
        }
    }

    /**
     * Compound Interest Formula: A = P * (1 + r/n)^(n*t)
     * where:
     *   P = principal
     *   r = annual interest rate (decimal)
     *   n = compounding frequency per year
     *   t = time in years
     */
    static double calculateCompoundInterest(double principal, double annualRate,
                                            int years, int compoundingFrequency) {
        double r = annualRate / 100.0;
        double base = 1.0 + (r / compoundingFrequency);
        double exponent = (double) compoundingFrequency * years;
        return Math.round(principal * Math.pow(base, exponent) * 100.0) / 100.0;
    }

    private void sendToWebSocket(String callbackUrl, String connectionId, Map<String, Object> payload) {
        try (ApiGatewayManagementApiClient apiClient = ApiGatewayManagementApiClient.builder()
                .endpointOverride(URI.create(callbackUrl))
                .build()) {

            String json = objectMapper.writeValueAsString(payload);
            logger.info("Sending result to WebSocket connection [{}]: {}", connectionId, json);

            apiClient.postToConnection(PostToConnectionRequest.builder()
                    .connectionId(connectionId)
                    .data(SdkBytes.fromUtf8String(json))
                    .build());

            logger.info("Successfully sent result to connection [{}]", connectionId);
        } catch (GoneException e) {
            logger.warn("WebSocket connection [{}] is gone (client disconnected)", connectionId);
        } catch (Exception e) {
            logger.error("Failed to send to WebSocket connection [{}]: {}", connectionId, e.getMessage(), e);
            throw new RuntimeException("WebSocket send failed", e);
        }
    }

    private int countRecords(KafkaEvent event) {
        return event.getRecords().values().stream()
                .mapToInt(java.util.List::size)
                .sum();
    }
}
