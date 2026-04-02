package com.compoundcalc.lambda;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.*;

import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/**
 * DynamoDB-based result cache for compound interest calculations.
 * 
 * Uses a hash of the input parameters as the cache key, so identical
 * calculations return instantly without recomputation.
 * 
 * Designed for DR with DynamoDB Global Tables:
 * - Both regions can read AND write (true active-active)
 * - Sub-second cross-region replication
 * - Built-in TTL for automatic cache expiry
 */
public class ResultCacheService {

    private static final Logger logger = LoggerFactory.getLogger(ResultCacheService.class);

    private final DynamoDbClient dynamoDbClient;
    private final String tableName;
    private final long ttlSeconds;

    /**
     * @param tableName DynamoDB table name (from CACHE_TABLE_NAME env var)
     * @param ttlSeconds TTL in seconds for cached entries (default: 24 hours)
     */
    public ResultCacheService(String tableName, long ttlSeconds) {
        this.tableName = tableName;
        this.ttlSeconds = ttlSeconds;
        this.dynamoDbClient = DynamoDbClient.create();
        logger.info("ResultCacheService initialized: table={}, ttl={}s", tableName, ttlSeconds);
    }

    /**
     * Generate a deterministic cache key from input parameters.
     * Uses SHA-256 hash of "principal:annualRate:years:compoundingFrequency".
     */
    public static String cacheKey(double principal, double annualRate, int years, int compoundingFrequency) {
        String raw = String.format("%.2f:%.4f:%d:%d", principal, annualRate, years, compoundingFrequency);
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(raw.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (Exception e) {
            // Fallback to raw string if hashing fails
            return raw;
        }
    }

    /**
     * Look up a cached result by input parameters.
     * Returns the cached finalAmount if found and not expired, empty otherwise.
     */
    public Optional<Double> get(double principal, double annualRate, int years, int compoundingFrequency) {
        String key = cacheKey(principal, annualRate, years, compoundingFrequency);
        try {
            Map<String, AttributeValue> keyMap = new HashMap<>();
            keyMap.put("cacheKey", AttributeValue.fromS(key));

            GetItemResponse response = dynamoDbClient.getItem(GetItemRequest.builder()
                    .tableName(tableName)
                    .key(keyMap)
                    .consistentRead(false) // eventual consistency is fine for cache
                    .build());

            if (response.hasItem() && response.item().containsKey("finalAmount")) {
                double cachedAmount = Double.parseDouble(response.item().get("finalAmount").n());
                logger.info("Cache HIT for key={} => finalAmount={}", key.substring(0, 12), cachedAmount);
                return Optional.of(cachedAmount);
            }

            logger.info("Cache MISS for key={}", key.substring(0, 12));
            return Optional.empty();

        } catch (Exception e) {
            logger.warn("Cache lookup failed (proceeding without cache): {}", e.getMessage());
            return Optional.empty();
        }
    }

    /**
     * Store a computation result in the cache.
     * Includes TTL for automatic expiry by DynamoDB.
     */
    public void put(double principal, double annualRate, int years, int compoundingFrequency, double finalAmount) {
        String key = cacheKey(principal, annualRate, years, compoundingFrequency);
        try {
            long expiresAt = Instant.now().getEpochSecond() + ttlSeconds;

            Map<String, AttributeValue> item = new HashMap<>();
            item.put("cacheKey", AttributeValue.fromS(key));
            item.put("principal", AttributeValue.fromN(String.valueOf(principal)));
            item.put("annualRate", AttributeValue.fromN(String.valueOf(annualRate)));
            item.put("years", AttributeValue.fromN(String.valueOf(years)));
            item.put("compoundingFrequency", AttributeValue.fromN(String.valueOf(compoundingFrequency)));
            item.put("finalAmount", AttributeValue.fromN(String.valueOf(finalAmount)));
            item.put("cachedAt", AttributeValue.fromN(String.valueOf(System.currentTimeMillis())));
            item.put("ttl", AttributeValue.fromN(String.valueOf(expiresAt)));

            dynamoDbClient.putItem(PutItemRequest.builder()
                    .tableName(tableName)
                    .item(item)
                    .build());

            logger.info("Cache PUT for key={} => finalAmount={}, expiresAt={}", key.substring(0, 12), finalAmount, expiresAt);

        } catch (Exception e) {
            logger.warn("Cache write failed (result still delivered via WebSocket): {}", e.getMessage());
        }
    }
}
