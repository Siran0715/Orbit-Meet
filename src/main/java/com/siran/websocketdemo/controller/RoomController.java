package com.siran.websocketdemo.controller;

import com.siran.websocketdemo.service.RoomService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/rooms")
public class RoomController {

    private final RoomService roomService;

    public RoomController(RoomService roomService) {
        this.roomService = roomService;
    }

    @PostMapping
    public ResponseEntity<Map<String, String>> createRoom() {

        String roomId = roomService.createRoom();

        return ResponseEntity.ok(
                Map.of("roomId", roomId)
        );
    }

    @GetMapping("/{roomId}")
    public ResponseEntity<Map<String, Object>> checkRoom(
            @PathVariable String roomId) {

        boolean exists =
                roomService.roomExists(roomId);

        if (!exists) {
            return ResponseEntity.notFound().build();
        }

        return ResponseEntity.ok(
                Map.of(
                        "roomId", roomId,
                        "exists", true
                )
        );
    }
}