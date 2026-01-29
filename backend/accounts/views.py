from rest_framework import generics, permissions, status
from rest_framework.response import Response
import logging

from .serializers import RegisterSerializer

logger = logging.getLogger(__name__)


class RegisterView(generics.CreateAPIView):
    """
    Simple user registration endpoint.
    """

    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        logger.info(f"Registration request received: {request.data}")
        logger.info(f"Request content type: {request.content_type}")
        logger.info(f"Request META: {dict(request.META)}")
        
        serializer = self.get_serializer(data=request.data)
        
        if not serializer.is_valid():
            logger.error(f"Validation errors: {serializer.errors}")
            from rest_framework.exceptions import ValidationError
            raise ValidationError(serializer.errors)
        
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        logger.info(f"User created successfully: {serializer.data.get('username')}")
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

