package com.policia.Ursala.service;

import com.policia.Ursala.model.CrimeReport;
import com.policia.Ursala.repository.CrimeReportRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class CrimeReportService {

    @Autowired
    private CrimeReportRepository repository;

    public CrimeReport createReport(CrimeReport report) {
        report.setStatus("PENDING");
        return repository.save(report);
    }

    public List<CrimeReport> getAllReports() {
        return repository.findAll();
    }
    
    // Added a standard method to fetch a single report for client tracking
    public Optional<CrimeReport> getReportById(Long id) {
        return repository.findById(id);
    }

    public Optional<CrimeReport> updateReportStatus(Long id, String newStatus) {
        // .map() will automatically apply the changes ONLY if the report exists
        return repository.findById(id).map(report -> {
            report.setStatus(newStatus);
            return repository.save(report);
        });
    }
}