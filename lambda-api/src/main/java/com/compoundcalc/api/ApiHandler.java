package com.compoundcalc.api;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.kafka.KafkaClient;
import software.amazon.awssdk.services.kafka.model.GetBootstrapBrokersRequest;
import software.amazon.awssdk.services.kafka.model.GetBootstrapBrokersResponse;

import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.serialization.StringSerializer;

import java.util.*;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.apache.kafka.clients.producer.RecordMetadata;

@SuppressWarnings("unchecked")
public class ApiHandler implements RequestHandler<Map<String, Object>, Map<String, Object>> {

    private static final Logger logger = LogManager.getLogger(ApiHandler.class);
    private static final ObjectMapper mapper = new ObjectMapper();

    private static final String MSK_CLUSTER_ARN = System.getenv("MSK_CLUSTER_ARN");
    private static final String KAFKA_TOPIC = System.getenv("KAFKA_TOPIC");

    private final Region awsRegion;
    private KafkaProducer<String, String> kafkaProducer;

    public ApiHandler() {
        String regionStr = System.getenv("AWS_REGION");
        if (regionStr == null) regionStr = "us-east-1";
        this.awsRegion = Region.of(regionStr);

        initKafkaProducer();
    }

    private void initKafkaProducer() {
        if (MSK_CLUSTER_ARN == null || MSK_CLUSTER_ARN.isEmpty()) {
            logger.warn("MSK_CLUSTER_ARN not set, Kafka producer disabled");
            return;
        }
        try {
            String bootstrapServers = resolveBootstrapServers();
            logger.info("Resolved MSK bootstrap servers: {}", bootstrapServers);
            ensureTopicExists(bootstrapServers);
            this.kafkaProducer = createKafkaProducer(bootstrapServers);
        } catch (Exception e) {
            logger.error("Failed to initialize Kafka producer", e);
        }
    }

    private void ensureTopicExists(String bootstrapServers) {
        Properties adminProps = new Properties();
        adminProps.put(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        adminProps.put(AdminClientConfig.REQUEST_TIMEOUT_MS_CONFIG, 10000);
        adminProps.put(AdminClientConfig.DEFAULT_API_TIMEOUT_MS_CONFIG, 15000);
        if (bootstrapServers.contains("9094")) {
            adminProps.put("security.protocol", "SSL");
        }

        try (AdminClient admin = AdminClient.create(adminProps)) {
            Set<String> topics = admin.listTopics().names().get(10, TimeUnit.SECONDS);
            if (!topics.contains(KAFKA_TOPIC)) {
                logger.info("Topic {} does not exist, creating...", KAFKA_TOPIC);
                NewTopic newTopic = new NewTopic(KAFKA_TOPIC, 3, (short) 2);
                admin.createTopics(Collections.singletonList(newTopic)).all().get(15, TimeUnit.SECONDS);
                logger.info("Topic {} created successfully", KAFKA_TOPIC);
            } else {
                logger.info("Topic {} already exists", KAFKA_TOPIC);
            }
        } catch (Exception e) {
            logger.warn("Could not ensure topic exists (may already exist): {}", e.getMessage());
        }
    }

    private String resolveBootstrapServers() {
        try (KafkaClient mskClient = KafkaClient.builder().region(awsRegion).build()) {
            GetBootstrapBrokersResponse response = mskClient.getBootstrapBrokers(
                    GetBootstrapBrokersRequest.builder()
                            .clusterArn(MSK_CLUSTER_ARN)
                            .build());
            String servers = response.bootstrapBrokerStringTls();
            if (servers == null || servers.isEmpty()) {
                servers = response.bootstrapBrokerString();
            }
            return servers;
        }
    }

    private KafkaProducer<String, String> createKafkaProducer(String bootstrapServers) {
        Properties props = new Properties();
        props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        props.put(ProducerConfig.ACKS_CONFIG, "all");
        props.put(ProducerConfig.RETRIES_CONFIG, 3);
        props.put(ProducerConfig.REQUEST_TIMEOUT_MS_CONFIG, 10000);
        props.put(ProducerConfig.DELIVERY_TIMEOUT_MS_CONFIG, 15000);
        props.put(ProducerConfig.MAX_BLOCK_MS_CONFIG, 10000);

        if (bootstrapServers.contains("9094")) {
            props.put("security.protocol", "SSL");
        }

        return new KafkaProducer<>(props);
    }

    @Override
    public Map<String, Object> handleRequest(Map<String, Object> event, Context context) {
        Map<String, Object> requestContext = (Map<String, Object>) event.get("requestContext");
        String routeKey = requestContext != null ? (String) requestContext.get("routeKey") : null;
        String connectionId = requestContext != null ? (String) requestContext.get("connectionId") : null;
        String domainName = requestContext != null ? (String) requestContext.get("domainName") : null;
        String stage = requestContext != null ? (String) requestContext.get("stage") : null;

        logger.info("WebSocket event: routeKey={}, connectionId={}", routeKey, connectionId);

        try {
            if ("$connect".equals(routeKey)) {
                logger.info("Client connected: {}", connectionId);
                return response(200, "Connected");
            } else if ("$disconnect".equals(routeKey)) {
                logger.info("Client disconnected: {}", connectionId);
                return response(200, "Disconnected");
            } else if ("calculate".equals(routeKey) || "$default".equals(routeKey)) {
                return handleCalculate(event, connectionId, domainName, stage);
            } else {
                logger.warn("Unknown route: {}", routeKey);
                return response(400, "Unknown route");
            }
        } catch (Exception e) {
            logger.error("Error handling WebSocket event", e);
            return response(500, "Internal error: " + e.getMessage());
        }
    }

    private Map<String, Object> handleCalculate(Map<String, Object> event, String connectionId,
                                                  String domainName, String stage) throws Exception {
        String body = (String) event.get("body");
        if (body == null || body.isBlank()) {
            return response(400, "{\"error\":\"Request body is required\"}");
        }

        Map<String, Object> input = mapper.readValue(body, Map.class);

        Double principal = toDouble(input.get("principal"));
        Double annualRate = toDouble(input.get("annualRate"));
        Integer years = toInteger(input.get("years"));
        Integer compoundingFrequency = toInteger(input.get("compoundingFrequency"));

        if (principal == null || principal <= 0) {
            return response(400, "{\"error\":\"principal must be > 0\"}");
        }
        if (annualRate == null || annualRate < 0 || annualRate > 100) {
            return response(400, "{\"error\":\"annualRate must be between 0 and 100\"}");
        }
        if (years == null || years <= 0 || years > 100) {
            return response(400, "{\"error\":\"years must be between 1 and 100\"}");
        }
        if (compoundingFrequency == null || compoundingFrequency <= 0) {
            return response(400, "{\"error\":\"compoundingFrequency must be > 0\"}");
        }

        String calculationId = UUID.randomUUID().toString();
        String wsCallbackUrl = "https://" + domainName + "/" + stage;

        // Publish to Kafka with connectionId + wsCallbackUrl for WebSocket push-back
        Map<String, Object> kafkaEvent = new LinkedHashMap<>();
        kafkaEvent.put("calculationId", calculationId);
        kafkaEvent.put("principal", principal);
        kafkaEvent.put("annualRate", annualRate);
        kafkaEvent.put("years", years);
        kafkaEvent.put("compoundingFrequency", compoundingFrequency);
        kafkaEvent.put("connectionId", connectionId);
        kafkaEvent.put("wsCallbackUrl", wsCallbackUrl);
        kafkaEvent.put("createdAt", System.currentTimeMillis());

        if (kafkaProducer != null) {
            String eventJson = mapper.writeValueAsString(kafkaEvent);
            logger.info("Sending event {} to Kafka topic {}", calculationId, KAFKA_TOPIC);
            Future<RecordMetadata> future = kafkaProducer.send(
                    new ProducerRecord<>(KAFKA_TOPIC, calculationId, eventJson));
            RecordMetadata metadata = future.get(15, TimeUnit.SECONDS);
            logger.info("Published event {} to Kafka partition={} offset={} connectionId={}",
                    calculationId, metadata.partition(), metadata.offset(), connectionId);
        } else {
            logger.warn("Kafka producer not configured, skipping publish");
            return response(500, "{\"error\":\"Kafka not available\"}");
        }

        return response(200, mapper.writeValueAsString(Map.of(
                "calculationId", calculationId,
                "status", "PENDING"
        )));
    }

    private Map<String, Object> response(int statusCode, String body) {
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("statusCode", statusCode);
        resp.put("body", body);
        return resp;
    }

    private Double toDouble(Object val) {
        if (val == null) return null;
        if (val instanceof Number) return ((Number) val).doubleValue();
        try { return Double.parseDouble(val.toString()); } catch (Exception e) { return null; }
    }

    private Integer toInteger(Object val) {
        if (val == null) return null;
        if (val instanceof Number) return ((Number) val).intValue();
        try { return Integer.parseInt(val.toString()); } catch (Exception e) { return null; }
    }
}
