package com.siran.websocketdemo.listener;

import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

@Component
public class WebSocketEventListener {

    @EventListener
    public void handleWebSocketDisconnectListener(
            SessionDisconnectEvent event) {

        StompHeaderAccessor headerAccessor =
                StompHeaderAccessor.wrap(event.getMessage());

        String username = null;
        String roomId = null;

        if (headerAccessor.getSessionAttributes() != null) {

            username = (String) headerAccessor
                    .getSessionAttributes()
                    .get("username");

            roomId = (String) headerAccessor
                    .getSessionAttributes()
                    .get("roomId");
        }

        System.out.println(
                "User disconnected: " + username
        );

        System.out.println(
                "Room ID: " + roomId
        );

        System.out.println(
                "Session ID: " + headerAccessor.getSessionId()
        );
    }
}