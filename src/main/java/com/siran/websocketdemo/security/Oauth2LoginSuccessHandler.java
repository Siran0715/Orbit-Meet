package com.siran.websocketdemo.security;

import com.siran.websocketdemo.entity.Users;
import com.siran.websocketdemo.repository.UserRepository;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.time.LocalDateTime;

@Component
public class Oauth2LoginSuccessHandler implements AuthenticationSuccessHandler {

    private final UserRepository userRepository;
    private final JwtService jwtService;

    public Oauth2LoginSuccessHandler(UserRepository userRepository,
                                     JwtService jwtService) {
        this.userRepository = userRepository;
        this.jwtService = jwtService;
    }

    @Override
    public void onAuthenticationSuccess(
            HttpServletRequest request,
            HttpServletResponse response,
            Authentication authentication
    ) throws IOException, ServletException {

        OAuth2User oauth2User = (OAuth2User) authentication.getPrincipal();

        String googleId = oauth2User.getAttribute("sub");
        String name = oauth2User.getAttribute("name");
        String email = oauth2User.getAttribute("email");
        String picture = oauth2User.getAttribute("picture");

        Users users = userRepository
                .findByGoogleId(googleId)
                .orElseGet(() -> {

                    Users newUser = new Users();

                    newUser.setGoogleId(googleId);
                    newUser.setName(name);
                    newUser.setEmail(email);
                    newUser.setProfilePicture(picture);
                    newUser.setRole("USER");

                    LocalDateTime now = LocalDateTime.now();

                    newUser.setCreatedAt(now);
                    newUser.setUpdatedAt(now);

                    return userRepository.save(newUser);
                });

        users.setName(name);
        users.setEmail(email);
        users.setProfilePicture(picture);
        users.setUpdatedAt(LocalDateTime.now());

        userRepository.save(users);

        String token = jwtService.generateToken(users);

        response.sendRedirect("/?token=" + token);
    }
}