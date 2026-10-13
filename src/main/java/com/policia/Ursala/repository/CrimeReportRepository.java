package com.policia.Ursala.repository;

import com.policia.Ursala.model.CrimeReport;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface CrimeReportRepository extends JpaRepository<CrimeReport, Long> {
}