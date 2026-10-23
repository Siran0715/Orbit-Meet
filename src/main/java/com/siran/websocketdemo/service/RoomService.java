package com.siran.websocketdemo.service;

import org.springframework.stereotype.Service;

import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class RoomService {

    private final Set<String> rooms =
            ConcurrentHashMap.newKeySet();

    public String createRoom() {

        String roomId;

        do {
            roomId = UUID.randomUUID()
                    .toString()
                    .substring(0, 8);
        } while (rooms.contains(roomId));

        rooms.add(roomId);

        return roomId;
    }

    public boolean roomExists(String roomId) {
        return rooms.contains(roomId);
    }

    public void removeRoom(String roomId) {
        rooms.remove(roomId);
    }
}