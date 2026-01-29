from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User
from .models import Placeholder


# Unregister the default User admin and register with enhanced admin
admin.site.unregister(User)

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """Enhanced User admin for managing users"""
    list_display = ('username', 'email', 'first_name', 'last_name', 'is_staff', 'is_active', 'date_joined')
    list_filter = ('is_staff', 'is_superuser', 'is_active', 'date_joined')
    search_fields = ('username', 'email', 'first_name', 'last_name')
    ordering = ('-date_joined',)


@admin.register(Placeholder)
class PlaceholderAdmin(admin.ModelAdmin):
    """Admin for Placeholder model"""
    list_display = ('id', 'created_at')
    list_filter = ('created_at',)
    readonly_fields = ('created_at',)
    date_hierarchy = 'created_at'

