package com.siran.websocketdemo.security;

import com.siran.websocketdemo.entity.Users;
import com.siran.websocketdemo.repository.UserRepository;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

@Component
public class WebSocketAuthInterceptor implements ChannelInterceptor {

    private final JwtService jwtService;
    private final UserRepository userRepository;

    public WebSocketAuthInterceptor(
            JwtService jwtService,
            UserRepository userRepository
    ) {
        this.jwtService = jwtService;
        this.userRepository = userRepository;
    }

    @Override
    public Message<?> preSend(
            Message<?> message,
            MessageChannel channel
    ) {

        StompHeaderAccessor accessor =
                StompHeaderAccessor.wrap(message);

        if (StompCommand.CONNECT.equals(accessor.getCommand())) {

            String authHeader =
                    accessor.getFirstNativeHeader("Authorization");

            if (authHeader == null ||
                    !authHeader.startsWith("Bearer ")) {

                System.out.println(
                        "WebSocket rejected: JWT missing"
                );

                throw new IllegalArgumentException(
                        "JWT token is required"
                );
            }

            String token =
                    authHeader.substring(7);

            if (!jwtService.isTokenValid(token)) {

                System.out.println(
                        "WebSocket rejected: Invalid JWT"
                );

                throw new IllegalArgumentException(
                        "Invalid JWT token"
                );
            }

            Long userId =
                    jwtService.extractUserId(token);

            Users user =
                    userRepository.findById(userId)
                            .orElseThrow(() ->
                                    new IllegalArgumentException(
                                            "User not found"
                                    )
                            );

            Authentication authentication =
                    new UsernamePasswordAuthenticationToken(
                            user,
                            null,
                            null
                    );

            /*
             * IMPORTANT:
             * Attach authenticated user to STOMP session.
             */
            accessor.setUser(authentication);

            /*
             * IMPORTANT:
             * Return a NEW message containing the modified headers.
             */
            return MessageBuilder.createMessage(
                    message.getPayload(),
                    accessor.getMessageHeaders()
            );
        }

        return message;
    }
}