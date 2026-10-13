package com.policia.Ursala.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable()) 
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/", "/*.html", "/*.css", "/*.js").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/reports").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/reports/{id}").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/reports").hasRole("POLICE")
                .requestMatchers(HttpMethod.PATCH, "/api/reports/**").hasRole("POLICE")
                .anyRequest().authenticated()
            )
            .httpBasic(Customizer.withDefaults()); // Replaced the empty lambda with standard defaults

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public UserDetailsService userDetailsService(PasswordEncoder passwordEncoder) {
        UserDetails police = User.builder()
            .username("officer")
            .password(passwordEncoder.encode("32450"))
            .roles("POLICE")
            .build();

        return new InMemoryUserDetailsManager(police);
    }
}