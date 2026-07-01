#!/bin/bash

# common_functions.sh
# Shared functions for AIDriver MicroPython build scripts
# Source this file in other scripts: source "$(dirname "$0")/common_functions.sh"

# Colors for output
export RED='\033[0;31m'
export GREEN='\033[0;32m'
export YELLOW='\033[1;33m'
export BLUE='\033[0;34m'
export CYAN='\033[0;36m'
export NC='\033[0m' # No Color

# Configuration - centralized paths and settings
# Resolve project root dynamically from this file location so scripts work
# regardless of the checked-out workspace folder name.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PROJECT_BASE="$(cd "$SCRIPT_DIR/.." && pwd)"
export PROJECT_DIR="$PROJECT_BASE/project"
export PROJECT_LIB_DIR="$PROJECT_DIR/lib"
export PROJECT_MAIN="$PROJECT_DIR/main.py"
export MICROPYTHON_DIR="$PROJECT_BASE/micropython"
export MODULES_DIR="$MICROPYTHON_DIR/ports/rp2/modules"
export BUILD_DIR="$MICROPYTHON_DIR/ports/rp2"
export FIRMWARE_DEST="$PROJECT_BASE/_Firmware/THS_Comp_RP2040.uf2"

# Custom module files to copy to frozen modules (centralized list)
# Mirrors project/lib/*.py so the firmware is self-contained: aidriver and every
# driver it imports are frozen. main.py is excluded - it goes to the filesystem.
export CUSTOM_FILES=(
    "$PROJECT_LIB_DIR/aidriver.py"
    "$PROJECT_LIB_DIR/eventlog.py"
    "$PROJECT_LIB_DIR/grove_ultrasonic.py"
    "$PROJECT_LIB_DIR/lsm6ds3.py"
    "$PROJECT_LIB_DIR/tcs34725.py"
    "$PROJECT_LIB_DIR/ssd1306.py"
)

# Files to copy to filesystem (not frozen)
export FILESYSTEM_FILES=(
    "$PROJECT_MAIN"
)

# Function to print colored messages
log_info() {
    echo -e "${BLUE}$1${NC}"
}

log_success() {
    echo -e "${GREEN}$1${NC}"
}

log_warning() {
    echo -e "${YELLOW}$1${NC}"
}

log_error() {
    echo -e "${RED}$1${NC}"
}

log_section() {
    echo -e "${CYAN}=== $1 ===${NC}"
}

# Function to validate environment prerequisites
validate_environment() {
    log_section "Environment Validation"
    
    # Check if project directory exists
    if [ ! -d "$PROJECT_DIR" ]; then
        log_error "❌ Error: Project directory not found at $PROJECT_DIR"
        log_warning "💡 Make sure the repository folder is properly mounted"
        return 1
    fi
    
    # Check required tools
    local missing_tools=()
    command -v python3 >/dev/null || missing_tools+=("python3")
    command -v git >/dev/null || missing_tools+=("git")
    command -v make >/dev/null || missing_tools+=("make")
    
    if [ ${#missing_tools[@]} -ne 0 ]; then
        log_error "❌ Missing required tools: ${missing_tools[*]}"
        return 1
    fi

    # Ensure MicroPython source tree is present (submodule may be uninitialized)
    if [ ! -d "$BUILD_DIR" ]; then
        log_warning "⚠️  MicroPython source tree not found at $BUILD_DIR"
        log_info "🔧 Initializing MicroPython submodule..."

        if (cd "$PROJECT_BASE" && git submodule update --init --recursive micropython); then
            log_success "✅ MicroPython submodule initialized"
        else
            log_error "❌ Failed to initialize MicroPython submodule"
            log_warning "💡 Run 'cd $PROJECT_BASE && git submodule update --init --recursive micropython' and retry"
            return 1
        fi
    fi

    # Ensure modules directory exists (first-time setup)
    if [ ! -d "$MODULES_DIR" ]; then
        log_warning "⚠️  MicroPython modules directory not found at $MODULES_DIR"
        log_info "🔧 Running first-time setup: make submodules"

        if (cd "$BUILD_DIR" && make submodules); then
            log_success "✅ Submodules initialized"
        else
            log_error "❌ Failed to initialize submodules"
            log_warning "💡 Run 'cd $BUILD_DIR && make submodules' manually and retry"
            return 1
        fi
    fi
    
    log_success "✅ Environment validation passed"
    return 0
}

# Function to copy and validate a single file
copy_and_validate_file() {
    local src_file="$1"
    local filename="$(basename "$src_file")"
    local dest_file="$MODULES_DIR/$filename"
    
    if [ -f "$src_file" ]; then
        log_info "📄 Copying $filename..."
        cp "$src_file" "$dest_file" || return 1
        
        # Validate Python syntax
        if python3 -m py_compile "$dest_file" 2>/dev/null; then
            log_success "✅ $filename - copied and validated"
            return 0
        else
            log_error "❌ $filename - syntax error detected"
            rm -f "$dest_file"  # Remove invalid file
            return 1
        fi
    else
        log_warning "⚠️  $filename - not found at $src_file"
        return 1
    fi
}

# Function to clean existing custom modules
clean_custom_modules() {
    local frozen_target_dir="$MODULES_DIR"
    local frozen_mpy_dir="$BUILD_DIR/build-RPI_PICO/frozen_mpy"
    
    log_info "🧹 Cleaning existing custom modules..."
    
    # Define module filenames to clean from frozen modules
    local frozen_modules=("aidriver.py" "eventlog.py" "grove_ultrasonic.py" "lsm6ds3.py" "tcs34725.py" "ssd1306.py")
    local filesystem_modules=("main.py")
    
    # Clean frozen modules
    for module in "${frozen_modules[@]}"; do
        if [[ -f "$frozen_target_dir/$module" ]]; then
            log_info "Removing frozen module: $module"
            rm -f "$frozen_target_dir/$module"
        fi
    done
    
    # Clean main.py from frozen modules (it should be filesystem only)
    for module in "${filesystem_modules[@]}"; do
        if [[ -f "$frozen_target_dir/$module" ]]; then
            log_info "Removing $module from frozen modules (will be filesystem file)"
            rm -f "$frozen_target_dir/$module"
        fi
        
        # Also remove compiled .mpy files
        local mpy_name="${module%.py}.mpy"
        if [[ -f "$frozen_mpy_dir/$mpy_name" ]]; then
            log_info "Removing compiled $mpy_name from frozen modules"
            rm -f "$frozen_mpy_dir/$mpy_name"
        fi
    done
    
    log_success "✅ Custom modules cleaned"
}

# Function to copy all custom modules
copy_custom_modules() {
    local source_dir="${PROJECT_DIR}"
    local frozen_target_dir="$MODULES_DIR"
    local filesystem_target_dir="$BUILD_DIR/build-RPI_PICO"
    local frozen_copy_count=0
    local filesystem_copy_count=0
    
    log_info "Copying custom modules to MicroPython directories..."
    
    # Clean existing modules first
    clean_custom_modules
    
    if [[ ! -d "$source_dir" ]]; then
        log_error "Source directory does not exist: $source_dir"
        return 1
    fi
    
    mkdir -p "$frozen_target_dir"
    mkdir -p "$filesystem_target_dir"
    
    # Copy .py files from project root
    if ls "$source_dir"/*.py >/dev/null 2>&1; then
        for file in "$source_dir"/*.py; do
            if [[ -f "$file" ]]; then
                local filename=$(basename "$file")
                
                # main.py is the run-script and goes to the filesystem;
                # all other root .py files go to frozen modules.
                if [[ "$filename" == "main.py" ]]; then
                    echo "Copying $filename to filesystem"
                    cp "$file" "$filesystem_target_dir/"
                    filesystem_copy_count=$((filesystem_copy_count + 1))
                else
                    echo "Copying $filename to frozen modules"
                    cp "$file" "$frozen_target_dir/"
                    frozen_copy_count=$((frozen_copy_count + 1))
                fi
            fi
        done
    fi
    
    # Copy .py files from project/lib directory (all go to frozen modules)
    local lib_dir="$source_dir/lib"
    if [[ -d "$lib_dir" ]] && ls "$lib_dir"/*.py >/dev/null 2>&1; then
        for file in "$lib_dir"/*.py; do
            if [[ -f "$file" ]]; then
                local filename=$(basename "$file")
                echo "Copying $filename to frozen modules"
                cp "$file" "$frozen_target_dir/"
                frozen_copy_count=$((frozen_copy_count + 1))
            fi
        done
    fi
    
    log_success "Copied $frozen_copy_count modules to frozen modules directory"
    log_success "Copied $filesystem_copy_count files to filesystem directory"
    return 0
}

# Function to check internet connectivity
check_internet() {
    if ping -c 1 -W 3 github.com &> /dev/null; then
        return 0
    else
        return 1
    fi
}

# Function to get MicroPython version info
get_micropython_version() {
    cd "$MICROPYTHON_DIR"
    local commit=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    local date=$(git log -1 --format=%cd --date=short 2>/dev/null || echo "unknown")
    local tag=$(git describe --tags --always 2>/dev/null || echo "unknown")
    echo "$tag ($commit, $date)"
}

# Function to show current status
show_status() {
    log_section "Current Status"
    log_info "📁 Project directory: $PROJECT_DIR"
    log_info "📁 MicroPython directory: $MICROPYTHON_DIR"
    log_info "📋 MicroPython version: $(get_micropython_version)"
}

# Function to create firmware destination directory
ensure_firmware_dir() {
    mkdir -p "$(dirname "$FIRMWARE_DEST")"
}

# Function to create _boot.py with embedded main.py content
create_boot_with_main() {
    local main_py_path="$PROJECT_DIR/main.py"
    local boot_py_path="$MODULES_DIR/_boot.py"
    local boot_backup_path="$MODULES_DIR/_boot_original.py"
    
    if [[ ! -f "$main_py_path" ]]; then
        log_error "main.py not found at $main_py_path"
        return 1
    fi
    
    log_info "📝 Creating _boot.py with embedded main.py content..."
    
    # Use Python script to properly handle the content embedding
    if python3 "$SCRIPT_DIR/create_boot.py" "$main_py_path" "$boot_py_path" "$boot_backup_path"; then
        log_success "✅ Created _boot.py with embedded main.py content"
        return 0
    else
        log_error "❌ Failed to create _boot.py"
        return 1
    fi
}

# Trap function for cleanup on script exit
cleanup_on_exit() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        log_warning "⚠️  Script exited with error code $exit_code"
        log_info "💡 Check the error messages above for troubleshooting guidance"
    fi
}

# Set up trap for cleanup
trap cleanup_on_exit EXIT