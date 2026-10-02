# --- Build stage: compile and package inside the image (no local Maven/JDK needed) ---
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
# Cache dependencies first for faster rebuilds
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src ./src
# Skip tests here; tests need a Docker daemon (Testcontainers) and run via `mvn test` on the host
RUN mvn -q -B clean package -DskipTests

# --- Runtime stage: slim JRE with just the fat jar ---
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /build/target/rate-limiter-0.0.1-SNAPSHOT.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java","-jar","/app/app.jar"]
