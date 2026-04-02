package com.compoundcalc.service;

import com.compoundcalc.model.CalculationResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.*;

import java.util.HashMap;
import java.util.Map;

@Service
public class DynamoDbService {

    private static final Logger logger = LoggerFactory.getLogger(DynamoDbService.class);

    private final DynamoDbClient dynamoDbClient;

    @Value("${aws.dynamodb.table-name:CompoundInterestCalculations}")
    private String tableName;

    public DynamoDbService(DynamoDbClient dynamoDbClient) {
        this.dynamoDbClient = dynamoDbClient;
    }

    public void saveCalculationRequest(String calculationId, Double principal, Double annualRate,
                                       Integer years, Integer compoundingFrequency) {
        Map<String, AttributeValue> item = new HashMap<>();
        item.put("calculationId", AttributeValue.builder().s(calculationId).build());
        item.put("status", AttributeValue.builder().s("PENDING").build());
        item.put("principal", AttributeValue.builder().n(String.valueOf(principal)).build());
        item.put("annualRate", AttributeValue.builder().n(String.valueOf(annualRate)).build());
        item.put("years", AttributeValue.builder().n(String.valueOf(years)).build());
        item.put("compoundingFrequency", AttributeValue.builder().n(String.valueOf(compoundingFrequency)).build());
        item.put("createdAt", AttributeValue.builder().n(String.valueOf(System.currentTimeMillis())).build());

        PutItemRequest request = PutItemRequest.builder()
                .tableName(tableName)
                .item(item)
                .build();

        dynamoDbClient.putItem(request);
        logger.info("Saved calculation request [{}] to DynamoDB", calculationId);
    }

    public CalculationResponse getCalculationResult(String calculationId) {
        GetItemRequest request = GetItemRequest.builder()
                .tableName(tableName)
                .key(Map.of("calculationId", AttributeValue.builder().s(calculationId).build()))
                .build();

        GetItemResponse response = dynamoDbClient.getItem(request);

        if (!response.hasItem() || response.item().isEmpty()) {
            return null;
        }

        Map<String, AttributeValue> item = response.item();
        CalculationResponse result = new CalculationResponse();
        result.setCalculationId(calculationId);
        result.setStatus(item.get("status").s());
        result.setPrincipal(Double.parseDouble(item.get("principal").n()));
        result.setAnnualRate(Double.parseDouble(item.get("annualRate").n()));
        result.setYears(Integer.parseInt(item.get("years").n()));
        result.setCompoundingFrequency(Integer.parseInt(item.get("compoundingFrequency").n()));

        if (item.containsKey("finalAmount")) {
            result.setFinalAmount(Double.parseDouble(item.get("finalAmount").n()));
        }
        if (item.containsKey("errorMessage")) {
            result.setErrorMessage(item.get("errorMessage").s());
        }
        if (item.containsKey("createdAt")) {
            result.setCreatedAt(Long.parseLong(item.get("createdAt").n()));
        }
        if (item.containsKey("completedAt")) {
            result.setCompletedAt(Long.parseLong(item.get("completedAt").n()));
        }

        return result;
    }
}
