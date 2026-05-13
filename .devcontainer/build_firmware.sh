#!/bin/bash

# build_firmware.sh
# Automated MicroPython firmware build script for AIDriver project
# This script handles updating MicroPython, copying custom modules and building the firmware
# 
# Usage: ./build_firmware.sh [OPTIONS]
#   --skip-update: Skip MicroPython repository update (use current version)
#   --force-clean: Force clean build (removes build cache)
#   --help: Show this help message

set -e  # Exit on any error

# Get script directory and source common functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common_functions.sh"

# Parse command line arguments
SKIP_UPDATE=false
FORCE_CLEAN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-update)
            SKIP_UPDATE=true
            shift
            ;;
        --force-clean)
            FORCE_CLEAN=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --skip-update   Skip MicroPython repository update"
            echo "  --force-clean   Force clean build (removes build cache)"
            echo "  --help         Show this help message"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            log_info "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Main script execution
main() {
    log_section "AIDriver MicroPython Firmware Builder"
    
    # Validate environment
    if ! validate_environment; then
        exit 1
    fi
    
    show_status
    
    # Step 1: Copy custom modules
    copy_custom_modules
    
    # Step 1.5: Create _boot.py with embedded main.py
    create_boot_with_main
    
    # Step 2: Update MicroPython (if requested)
    if [ "$SKIP_UPDATE" = false ]; then
        update_micropython
    else
        log_warning "⏭️  Skipping MicroPython update (using current version)"
        cd "$MICROPYTHON_DIR"
        log_info "📋 Using MicroPython version: $(get_micropython_version)"
    fi
    
    # Step 3: Build firmware
    build_firmware
    
    # Step 4: Package result
    package_firmware
    
    log_section "Build Complete"
    log_success "✅ AIDriver firmware build complete!"
    log_info "📦 Firmware location: $FIRMWARE_DEST"
    log_info "💡 Flash to Pico: Copy THS_Comp_RP2040.uf2 to Pico while holding BOOTSEL"
}

# Function to update MicroPython repository
update_micropython() {
    log_section "MicroPython Repository Update"
    cd "$MICROPYTHON_DIR"
    
    # Check if we have internet connectivity
    if check_internet; then
        log_info "📡 Fetching latest MicroPython code..."
        
        # Store current state for potential rollback
        local current_commit=$(git rev-parse HEAD)
        
        # Fetch and update
        if git fetch origin && git pull origin master; then
            local new_version=$(get_micropython_version)
            log_success "✅ Updated to MicroPython version: $new_version"
        else
            log_error "❌ Failed to update MicroPython repository"
            log_warning "⏪ Rolling back to previous state..."
            git reset --hard "$current_commit"
            log_warning "⚠️  Continuing with previous version"
        fi
    else
        log_warning "⚠️  No internet connection - using current MicroPython version"
        log_info "📋 Current version: $(get_micropython_version)"
    fi
}

# Function to build firmware
build_firmware() {
    log_section "Firmware Build"
    cd "$BUILD_DIR"
    
    # Update submodules
    log_info "🔄 Updating submodules..."
    if ! make submodules; then
        log_error "❌ Failed to update submodules"
        exit 1
    fi
    
    # Clean build if requested or if this is first build
    if [ "$FORCE_CLEAN" = true ] || [ ! -d "build-RPI_PICO" ]; then
        log_info "🧹 Cleaning build directory..."
        make clean
    fi
    
    # Build firmware
    log_info "⚙️  Compiling firmware..."
    log_info "   This may take 10-20 minutes..."
    
    if make -j$(nproc); then
        log_success "🎉 Build successful!"
    else
        log_error "❌ Build failed!"
        log_info "💡 Try running with --force-clean for a fresh build"
        exit 1
    fi
    
    # Verify build output
    if [ ! -f "$BUILD_DIR/build-RPI_PICO/firmware.uf2" ]; then
        log_error "❌ Firmware file not found after build"
        exit 1
    fi
    
    local firmware_size=$(stat -c%s "$BUILD_DIR/build-RPI_PICO/firmware.uf2" 2>/dev/null || echo "unknown")
    log_info "📋 Firmware size: $firmware_size bytes"
}

# Function to package firmware
package_firmware() {
    log_section "Firmware Packaging"
    
    ensure_firmware_dir
    
    # Copy firmware with verification
    if cp "$BUILD_DIR/build-RPI_PICO/firmware.uf2" "$FIRMWARE_DEST"; then
        log_success "📦 Firmware copied to: $FIRMWARE_DEST"
        
        # Show file info
        ls -lh "$FIRMWARE_DEST"
        
        # Add build metadata
        local build_info="$PROJECT_BASE/_Firmware/build_info.txt"
        {
            echo "Build Date: $(date)"
            echo "MicroPython Version: $(get_micropython_version)"
            echo "Custom Modules: ${#CUSTOM_FILES[@]} files"
            echo "Build Host: $(hostname)"
        } > "$build_info"
        
        log_info "📋 Build info saved to: $build_info"
    else
        log_error "❌ Failed to copy firmware"
        exit 1
    fi
}

# Run main function
main "$@"