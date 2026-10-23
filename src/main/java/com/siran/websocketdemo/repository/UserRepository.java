package com.siran.websocketdemo.repository;

import com.siran.websocketdemo.entity.Users;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserRepository extends JpaRepository<Users, Long> {

    Optional<Users> findByGoogleId(String googleId);

    Optional<Users> findByEmail(String email);
}