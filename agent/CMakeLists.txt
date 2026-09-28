cmake_minimum_required(VERSION 3.15)
project(dyarte-agent VERSION 1.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Include directories
include_directories(include)

# Source files
set(SOURCES
    src/main.cpp
    src/websocket_server.cpp
)

# Header files
set(HEADERS
    include/logger.h
    include/json_helper.h
    include/protocol.h
    include/sha1_base64.h
    include/websocket_server.h
    include/ed25519_verify.h
    include/agent_identity.h
    include/token_validator.h
    include/hardware_inventory.h
)

# Executable target
add_executable(dyarte-agent ${SOURCES} ${HEADERS})

# Windows Socket and Cryptography libraries
if(WIN32)
    target_link_libraries(dyarte-agent PRIVATE ws2_32 crypt32 bcrypt wbemuuid)
    target_compile_definitions(dyarte-agent PRIVATE _WIN32_WINNT=0x0A00)
endif()

# Set output directories
set_target_properties(dyarte-agent PROPERTIES
    OUTPUT_NAME "dyarte-agent"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/Release"
    RUNTIME_OUTPUT_DIRECTORY_RELEASE "${CMAKE_BINARY_DIR}/Release"
    RUNTIME_OUTPUT_DIRECTORY_DEBUG "${CMAKE_BINARY_DIR}/Debug"
)
