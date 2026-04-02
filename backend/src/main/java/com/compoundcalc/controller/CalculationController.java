package com.compoundcalc.controller;

import com.compoundcalc.model.CalculationRequest;
import com.compoundcalc.model.CalculationResponse;
import com.compoundcalc.service.CalculationService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/calculations")
public class CalculationController {

    private final CalculationService calculationService;

    public CalculationController(CalculationService calculationService) {
        this.calculationService = calculationService;
    }

    @PostMapping
    public ResponseEntity<CalculationResponse> submitCalculation(@Valid @RequestBody CalculationRequest request) {
        CalculationResponse response = calculationService.submitCalculation(request);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(response);
    }

    @GetMapping("/{calculationId}")
    public ResponseEntity<CalculationResponse> getCalculation(@PathVariable String calculationId) {
        CalculationResponse response = calculationService.getCalculation(calculationId);
        if (response == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(response);
    }

    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("OK");
    }
}
