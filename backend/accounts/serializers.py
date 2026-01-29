from django.contrib.auth import get_user_model
from rest_framework import serializers


User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=1)

    class Meta:
        model = User
        fields = ("id", "username", "email", "password")
        read_only_fields = ("id",)
        extra_kwargs = {
            "email": {"required": True},
            "username": {"required": True},
        }

    def validate_email(self, value):
        """Check if email is already in use."""
        if not value:
            raise serializers.ValidationError("Email is required.")
        # Normalize email (lowercase and strip whitespace)
        value = value.lower().strip()
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_username(self, value):
        """Check if username is already in use."""
        if not value:
            raise serializers.ValidationError("Username is required.")
        # Strip whitespace
        value = value.strip()
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("A user with this username already exists.")
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        # Ensure email is normalized (should already be from validate_email, but double-check)
        if 'email' in validated_data:
            validated_data['email'] = validated_data['email'].lower().strip()
        user = User(**validated_data)
        user.set_password(password)
        try:
            user.save()
        except Exception as e:
            # Handle database-level errors (e.g., unique constraint violations)
            raise serializers.ValidationError(f"Error creating user: {str(e)}")
        return user

