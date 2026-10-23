package com.siran.websocketdemo.controller;

import com.siran.websocketdemo.model.ChatMessage;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Controller;

import java.security.Principal;
import java.util.HashMap;
import java.util.Map;

@Controller
public class MessageController {

    private final SimpMessagingTemplate messagingTemplate;

    public MessageController(
            SimpMessagingTemplate messagingTemplate
    ) {
        this.messagingTemplate = messagingTemplate;
    }

    // =========================================================
    // CHAT
    // =========================================================

    @MessageMapping("/message")
    public void sendMessage(
            ChatMessage message,
            SimpMessageHeaderAccessor headerAccessor,
            Principal principal
    ) {

        if (message == null) {
            System.out.println("Message is null");
            return;
        }

        String roomId = message.getRoomId();
        String type = message.getType();

        if (roomId == null || roomId.isBlank()) {
            System.out.println("Room ID missing");
            return;
        }

        if (principal == null) {
            System.out.println("User not authenticated");
            return;
        }

        /*
         * IMPORTANT:
         * Do NOT cast principal.getPrincipal() directly to Users.
         *
         * Current authentication is OAuth2AuthenticationToken
         * and principal object is DefaultOidcUser.
         */

        String username = getUsername(principal);

        if (username == null || username.isBlank()) {
            username = "Unknown User";
        }

        // Server controls sender name
        message.setSender(username);


        // =====================================================
        // JOIN MESSAGE
        // =====================================================

        if ("JOIN".equalsIgnoreCase(type)) {

            if (headerAccessor.getSessionAttributes() != null) {

                headerAccessor.getSessionAttributes()
                        .put("username", username);

                headerAccessor.getSessionAttributes()
                        .put("roomId", roomId);
            }

            System.out.println(
                    "User joined chat: "
                            + username
                            + " | Room: "
                            + roomId
            );

            // Optional: broadcast JOIN event
            messagingTemplate.convertAndSend(
                    "/topic/room/"
                            + roomId
                            + "/messages",
                    message
            );

            return;
        }


        // =====================================================
        // CHAT MESSAGE
        // =====================================================

        if ("CHAT".equalsIgnoreCase(type)) {

            message.setSender(username);

            messagingTemplate.convertAndSend(
                    "/topic/room/"
                            + roomId
                            + "/messages",
                    message
            );

            System.out.println(
                    "Chat sent: "
                            + username
                            + " -> "
                            + message.getContent()
            );
        }
    }


    // =========================================================
    // WEBRTC SIGNALING
    // =========================================================

    @MessageMapping("/webrtc")
    public void handleWebRTCMessage(
            Map<String, Object> message,
            Principal principal
    ) {

        if (message == null) {
            System.out.println("WebRTC message is null");
            return;
        }

        if (principal == null) {
            System.out.println("WebRTC user not authenticated");
            return;
        }


        String type = (String) message.get("type");

        String roomId = (String) message.get("roomId");

        String sender = (String) message.get("sender");

        String target = (String) message.get("target");


        if (type == null || type.isBlank()) {
            System.out.println("WebRTC type missing");
            return;
        }

        if (roomId == null || roomId.isBlank()) {
            System.out.println("WebRTC room ID missing");
            return;
        }

        if (sender == null || sender.isBlank()) {
            System.out.println("WebRTC sender missing");
            return;
        }


        // Get authenticated Google username safely
        String username = getUsername(principal);

        if (username == null || username.isBlank()) {
            username = "Unknown User";
        }


        // Create new message
        Map<String, Object> signalMessage =
                new HashMap<>(message);


        /*
         * Do NOT trust senderName from frontend.
         * Replace it with authenticated user's name.
         */

        signalMessage.put(
                "senderName",
                username
        );


        // =====================================================
        // TARGETED MESSAGE
        // =====================================================

        if (target != null && !target.isBlank()) {

            System.out.println(
                    "Sending WebRTC signal to target: "
                            + target
            );

            messagingTemplate.convertAndSend(
                    "/topic/webrtc/"
                            + roomId
                            + "/"
                            + target,
                    (Object) signalMessage
            );

            return;
        }


        // =====================================================
        // BROADCAST MESSAGE
        // =====================================================

        System.out.println(
                "Broadcasting WebRTC signal to room: "
                        + roomId
        );

        messagingTemplate.convertAndSend(
                "/topic/webrtc/"
                        + roomId
                        + "/all",
                (Object) signalMessage
        );


        System.out.println(
                "WebRTC: "
                        + type
                        + " | Room: "
                        + roomId
                        + " | Sender: "
                        + sender
                        + " | Target: "
                        + target
        );
    }


    // =========================================================
    // GET USERNAME FROM AUTHENTICATION
    // =========================================================

    private String getUsername(
            Principal principal
    ) {

        if (!(principal instanceof Authentication authentication)) {
            return principal.getName();
        }


        Object authenticatedUser =
                authentication.getPrincipal();


        /*
         * OAuth2 Login user
         */

        if (authenticatedUser instanceof OAuth2User oauth2User) {

            String name =
                    oauth2User.getAttribute("name");

            if (name != null && !name.isBlank()) {
                return name;
            }

            String email =
                    oauth2User.getAttribute("email");

            if (email != null && !email.isBlank()) {
                return email;
            }
        }


        /*
         * Fallback
         */

        return authentication.getName();
    }
}