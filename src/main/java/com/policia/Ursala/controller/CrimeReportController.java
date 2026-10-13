package com.policia.Ursala.controller;

import com.policia.Ursala.model.CrimeReport;
import com.policia.Ursala.service.CrimeReportService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/reports")
public class CrimeReportController {

    @Autowired
    private CrimeReportService service;

    @PostMapping
    public ResponseEntity<CrimeReport> submitReport(@RequestBody CrimeReport report) {
        CrimeReport savedReport = service.createReport(report);
        return new ResponseEntity<>(savedReport, HttpStatus.CREATED); // 201 Created
    }

    @GetMapping
    public ResponseEntity<List<CrimeReport>> getAllReports() {
        return ResponseEntity.ok(service.getAllReports()); // 200 OK
    }

    // New endpoint so citizens can fetch only their specific report by ID
    @GetMapping("/{id}")
    public ResponseEntity<CrimeReport> getReportById(@PathVariable Long id) {
        return service.getReportById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build()); // 404 Not Found if missing
    }

    @PatchMapping("/{id}/status")
    public ResponseEntity<CrimeReport> updateStatus(@PathVariable Long id, @RequestParam String status) {
        return service.updateReportStatus(id, status)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build()); // 404 Not Found if missing
    }
}